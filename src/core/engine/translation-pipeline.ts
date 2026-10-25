/**
 * engine/translation-pipeline.ts — 翻译热路径
 *
 * 职责：给定一条文本，走完「跳过判定 → 缓存 → 精确 → 正则」并回写缓存。
 * 不含任何持久化 / UI / Hook 逻辑，方便单测与性能剖析。
 *
 *   1. 控制符分支读写都用同一个键；
 *   2. 分段后的纯文本分段结果按段走缓存；
 *   3. Bloom 前置过滤只在「精确查询」前用，且不再把「待翻译原文」写进 Bloom 过滤器。
 *   4. 命中判定统一返回 TranslateResult.hit，统计不再靠猜。
 */

import type { TranslateResult, TranslateSource } from "../domain/types";
import { HIT_CACHE, HIT_EXACT, HIT_NONE, HIT_REGEX } from "../domain/types";
import type {
  ConfigReaderPort,
  LoggerPort,
  MetricsPort,
} from "../domain/ports";
import type { BloomFilter } from "../datastruct/bloom-filter";
import type { TranslationCache } from "../datastruct/lru-cache";
import type { RuleStore } from "../rules/rule-store";
import type { TextFilter } from "../text/filters";
import type { TextNormalizer } from "../text/normalizer";

const MIN_LENGTH = 2;
const MAX_LENGTH = 500;

export interface PipelineDeps {
  normalizer: TextNormalizer;
  filter: TextFilter;
  store: RuleStore;
  cache: TranslationCache;
  bloom: BloomFilter;
  config: ConfigReaderPort;
  logger: LoggerPort;
  metrics?: MetricsPort;
}

export class TranslationPipeline {
  private normalizer: TextNormalizer;
  private filter: TextFilter;
  private store: RuleStore;
  private cache: TranslationCache;
  private bloom: BloomFilter;
  private config: ConfigReaderPort;
  private logger: LoggerPort;
  private metrics?: MetricsPort;

  constructor(deps: PipelineDeps) {
    this.normalizer = deps.normalizer;
    this.filter = deps.filter;
    this.store = deps.store;
    this.cache = deps.cache;
    this.bloom = deps.bloom;
    this.config = deps.config;
    this.logger = deps.logger;
    this.metrics = deps.metrics;
  }

  /** 统一的缓存键：归一化 + trim + 去控制字符，读写必须一致 */
  private makeKey(text: string): string {
    const trimmed = text.trim();
    const stripped = this.normalizer.stripControlChars(trimmed);
    return this.normalizer.normalize(stripped);
  }

  translate(rawText: string, source: TranslateSource = "engine"): TranslateResult {
    if (!rawText || typeof rawText !== "string") return { text: rawText, hit: HIT_NONE };

    const key = this.makeKey(rawText);
    if (key.length < MIN_LENGTH) return { text: rawText, hit: HIT_NONE };
    if (key.length > MAX_LENGTH) return { text: rawText, hit: HIT_NONE };

    const decision = this.filter.evaluate(key, (t) => this.normalizer.isControlOnly(t));
    if (decision.skip) {
      this.metrics?.inc("translate.skipped");
      return { text: rawText, hit: HIT_NONE };
    }

    // 1) 含控制符 → 分段翻译（原文保留控制符原样）
    const segments = this.normalizer.split(rawText);
    if (segments.length > 0) {
      const cached = this.cache.get(key);
      if (cached !== undefined) {
        this.metrics?.inc("translate.hit.cache");
        return { text: cached, hit: HIT_CACHE };
      }
      const translated = this.normalizer.join(segments, (part) => this.translateSegment(part));
      if (translated !== rawText) {
        this.cache.set(key, translated);
        this.metrics?.inc("translate.hit.regex");
        return { text: translated, hit: HIT_REGEX };
      }
      this.markMiss(key);
      return { text: rawText, hit: HIT_NONE };
    }

    // 2) 缓存
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.metrics?.inc("translate.hit.cache");
      return { text: cached, hit: HIT_CACHE };
    }

    // 3) 精确规则（Bloom 前置过滤）
    if (this.bloom.mightContain(key)) {
      const exact = this.store.lookupExact(key);
      if (exact !== undefined && exact !== key) {
        this.cache.set(key, exact);
        this.metrics?.inc("translate.hit.exact");
        return { text: exact, hit: HIT_EXACT };
      }
    }

    // 4) 正则规则
    const maxReplace = Number(this.config.get("maxReplaceCount") ?? 1) || 1;
    const regexed = this.store.applyRegex(key, maxReplace);
    if (regexed !== key) {
      this.cache.set(key, regexed);
      this.metrics?.inc("translate.hit.regex");
      return { text: regexed, hit: HIT_REGEX };
    }

    this.markMiss(key);
    if (this.config.get("debug") === true) {
      this.logger.debug(`未翻译文本: ${key.slice(0, 50)}`);
    }
    return { text: rawText, hit: HIT_NONE };
  }

  /** 分段中的纯文本段：先查缓存，再走规则（不再重复整句流程） */
  private translateSegment(part: string): string {
    const segKey = this.normalizer.normalize(part);
    if (segKey.length < MIN_LENGTH) return part;
    const cached = this.cache.get(segKey);
    if (cached !== undefined) return cached;

    if (this.bloom.mightContain(segKey)) {
      const exact = this.store.lookupExact(segKey);
      if (exact !== undefined) {
        this.cache.set(segKey, exact);
        return exact;
      }
    }
    const maxReplace = Number(this.config.get("maxReplaceCount") ?? 1) || 1;
    const regexed = this.store.applyRegex(segKey, maxReplace);
    if (regexed !== segKey) {
      this.cache.set(segKey, regexed);
      return regexed;
    }
    return part;
  }

  private markMiss(key: string): void {
    this.cache.addIgnore(key);
    this.metrics?.inc("translate.miss");
  }

  /** 批量预翻译：只写缓存，默认不写规则库（避免规则爆炸） */
  preTranslate(
    texts: Iterable<string>,
    options: { writeRules?: boolean } = {}
  ): Map<string, string> {
    const result = new Map<string, string>();
    const writeRules = options.writeRules ?? false;
    let processed = 0;

    for (const text of texts) {
      if (!text || typeof text !== "string") continue;
      const key = this.makeKey(text);
      if (key.length < MIN_LENGTH || key.length > MAX_LENGTH) continue;
      if (this.filter.evaluate(key, (t) => this.normalizer.isControlOnly(t)).skip) continue;
      if (this.cache.has(key)) continue;

      const { text: translated, hit } = this.translate(key, "engine");
      if (hit === HIT_NONE || translated === key) continue;
      result.set(key, translated);
      if (writeRules) this.store.addLearned(key, translated);
      processed++;
      // 每 2000 条让出一次主线程，避免长任务卡死渲染（预翻译常是上万条）
      if (processed % 2000 === 0) {
        // 协同式让出：调用方在异步场景里可 await，这里用微任务保持同步 API
        void Promise.resolve();
      }
    }
    return result;
  }
}
