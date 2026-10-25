/**
 * engine/translator.ts — 翻译引擎（编排层）
 *
 * 职责边界：
 *   - 负责「把各个能力拼起来」：规则库 + 缓存 + 流水线 + AI + 持久化；
 *   - 不认识 Hook、不认识 Vue、不直接操作 window；
 *   - 对外只暴露稳定 API，UI / Hook / 控制台都通过它工作。
 *
 *   1. 规则集变更不再全量 merge 拷贝
 *   2. 预翻译默认只预热缓存；
 *   3. 持久化统一走 SafeStorage（带前缀、配额保护），不再触碰宿主的其它键；
 *   4. stats 计算有 800ms 缓存，UI 每秒轮询不再重复构造大对象；
 *   5. 所有定时器由 Scheduler 托管，destroy() 。
 */

import type {
  AiFixRuleInput,
  ExportPayload,
  ImportResult,
  TranslationRuleInput,
  TranslatorStats,
} from "../domain/types";
import { HIT_NONE } from "../domain/types";
import type {
  ConfigReaderPort,
  KeyValueStorePort,
  LoggerPort,
  MetricsPort,
  SchedulerPort,
  TextTranslatorPort,
  HttpPort,
} from "../domain/ports";
import type { Disposer } from "../domain/disposable";
import { TranslationCache } from "../datastruct/lru-cache";
import { BloomFilter } from "../datastruct/bloom-filter";
import { RuleStore } from "../rules/rule-store";
import { AiFixRulesEngine } from "../rules/ai-fix-rules";
import { compactRules } from "../rules/rule-compactor";
import { TextNormalizer } from "../text/normalizer";
import { TextFilter } from "../text/filters";
import { TranslationPipeline } from "./translation-pipeline";
import type { AiTranslator } from "./ai-translator";
import {
  DEFAULT_SKIP_RULES,
  DEFAULT_TRANSLATION_RULES,
  PUNCTUATION_MAP,
  STORAGE_KEYS,
} from "../config/defaults";
import { Language } from "../../typings/enum";
import {
  detectKind,
  filterValidRows,
} from "../io/format-detector";
import {
  extractAiFixRules,
  isCollDataFormat,
  normalizeTranslationData,
  parseCollData,
  parseArray,
} from "../io/parsers";
import {
  getFileType,
  isSupportedFile,
  parseXlsx,
  readFileAsText,
  timestampFileName,
  getGameName,
  resolveFilePath,
  fetchText,
} from "../io/files";
import { parseDelimited, stringifyDelimited } from "../io/delimited";

export interface TranslatorDeps {
  config: ConfigReaderPort;
  logger: LoggerPort;
  scheduler: SchedulerPort;
  storage: KeyValueStorePort;
  metrics?: MetricsPort;
  aiTranslator: AiTranslator;
  /** 可选：按文件名从游戏目录读取规则文件 */
  http?: HttpPort;
}

const PUNCT_ONLY_RE =
  /^[\s%^&*()_+･\-=\[\]{};':"\\|,.<>\/?`~♪!@#$♡。，、；：？！…—～（）｛｝【】《》￥$€£¥¢·・…‥〃〆々〰]+$/;

export class Translator implements TextTranslatorPort {
  // ---- 能力组件 ----
  readonly normalizer: TextNormalizer;
  readonly filter: TextFilter;
  readonly store = new RuleStore({ chunkSize: 48 });
  readonly cache: TranslationCache;
  readonly bloom = new BloomFilter(2048, 12);
  readonly fixRules = new AiFixRulesEngine();
  readonly pipeline: TranslationPipeline;

  private config: ConfigReaderPort;
  private logger: LoggerPort;
  private scheduler: SchedulerPort;
  private storage: KeyValueStorePort;
  private metrics?: MetricsPort;
  private aiTranslator: AiTranslator;
  private http?: HttpPort;

  // ---- 状态 ----
  private initialized = false;
  private destroyed = false;
  private preTranslated = false;
  private missStreak = 0;
  private aiLearnedCount = 0;
  private compactStats: unknown | null = null;
  private saveScheduled: { cancel(): void; flush(): void } | null = null;
  private unsubscribes: Disposer[] = [];
  private hookInstaller: ((translate: (t: string) => string) => Disposer) | null = null;
  private statsCache: TranslatorStats | null = null;
  private statsAt = 0;

  constructor(deps: TranslatorDeps) {
    this.config = deps.config;
    this.logger = deps.logger;
    this.scheduler = deps.scheduler;
    this.storage = deps.storage;
    this.metrics = deps.metrics;
    this.aiTranslator = deps.aiTranslator;
    this.http = deps.http;

    this.normalizer = new TextNormalizer(PUNCTUATION_MAP);
    this.filter = new TextFilter({
      skipPatterns: DEFAULT_SKIP_RULES,
      punctuationPattern: PUNCT_ONLY_RE,
      targetLang: (this.config.get("targetLang") as Language) ?? Language.zh_CN,
    });
    this.cache = new TranslationCache({
      maxEntries: Number(this.config.get("maxCacheSize") ?? 20000),
      maxIgnored: 20000,
    });
    this.pipeline = new TranslationPipeline({
      normalizer: this.normalizer,
      filter: this.filter,
      store: this.store,
      cache: this.cache,
      bloom: this.bloom,
      config: this.config,
      logger: this.logger,
      metrics: this.metrics,
    });
  }

  // ==================== 生命周期 ====================

  init(): void {
    if (this.initialized || this.destroyed) return;
    this.initialized = true;

    const defaults = normalizeTranslationData(DEFAULT_TRANSLATION_RULES, "default");
    this.store.setLayer("default", defaults, true);
    this.store.rebuildBloom(this.bloom);
    this.logger.info(`默认规则加载完成（${this.store.defaultCount} 条）`);

    this.restoreCache();
    this.bindConfigChanges();
    this.logger.success("MTool 翻译引擎初始化完成");
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.saveUserData(true);
    for (const un of this.unsubscribes) un();
    this.unsubscribes = [];
    this.cache.clear();
    this.bloom.clear();
    this.store.clearLayer("user");
    this.store.clearLayer("learned");
    this.statsCache = null;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  private bindConfigChanges(): void {
    this.unsubscribes.push(
      this.config.subscribe((changed) => {
        if (changed.includes("targetLang")) {
          this.filter.setTargetLang((this.config.get("targetLang") as Language) ?? Language.zh_CN);
        }
        if (changed.includes("maxCacheSize")) {
          this.cache.setMaxSize(Number(this.config.get("maxCacheSize") ?? 20000));
        }
        this.statsAt = 0;
      })
    );
  }

  // ==================== Hook 装配（由容器注入，避免反向依赖）====================

  setHookInstaller(installer: (translate: (t: string) => string) => Disposer): void {
    this.hookInstaller = installer;
  }

  /** 安装/刷新引擎 Hook；返回释放函数 */
  installHooks(): Disposer {
    if (!this.hookInstaller) return () => {};
    return this.hookInstaller((text) => this.translate(text));
  }

  // ==================== 翻译 ====================

  translate(text: string): string {
    if (!text || typeof text !== "string") return text;
    if (this.destroyed) return text;
    const result = this.pipeline.translate(text, "engine");
    if (result.hit === HIT_NONE) this.onMiss(result.text);
    return result.text;
  }

  /**
   * 记录一条「见到的原文」。
   * 单参调用（只有原文、译文待定）时绝不写 Bloom：
   * 否则每条待翻译文本都会污染 Bloom，跑几万字后前置过滤 100% 假阳性。
   */
  addTranslation(text: string, result: string = ""): void {
    if (!text || typeof text !== "string") return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const value = (result || "").trim();
    if (!value || value === trimmed) return;
    const key = this.normalizer.normalize(this.normalizer.stripControlChars(trimmed));
    this.cache.set(key, value, true);
    this.store.addToBloom(this.bloom, key);
    this.missStreak = 0;
  }

  /** AI 译文后修正 + 学习 */
  fixAITranslation(original: string, aiResult: string): string {
    if (original === null || original === undefined) return aiResult ?? "";
    if (aiResult === null || aiResult === undefined) return String(original ?? "");
    let src = typeof original === "string" ? original : String(original);
    let out = typeof aiResult === "string" ? aiResult : String(aiResult);
    if (src === out) return out;

    const fixed = this.fixRules.fix(src, out);
    if (fixed && fixed !== src) {
      this.learn(src, fixed);
      return fixed;
    }
    if (out && out !== src) {
      this.learn(src, out);
      return out;
    }
    return out || src;
  }

  processAIResponse(original: string, aiResult: string): string {
    return this.fixAITranslation(original, aiResult);
  }

  hasAIFixRule(original: string): boolean {
    return this.fixRules.shouldIntercept(original);
  }

  private learn(original: string, translated: string): void {
    if (!original || !translated || original === translated) return;
    if (this.cache.get(original) === undefined) this.cache.set(original, translated, true);
    const key = this.normalizer.normalize(original);
    if (this.store.addLearned(key, translated)) this.aiLearnedCount++;
    this.store.addToBloom(this.bloom, key);
    this.missStreak = 0;
    this.statsAt = 0;
    this.scheduleSave();
  }

  // ==================== 未命中 → AI 兜底 ====================

  private onMiss(_text: string): void {
    this.missStreak++;
    if (!this.aiTranslator.isAvailable) return;
    const threshold = Number(this.config.get("aiTriggerThreshold") ?? 5) || 5;
    if (this.missStreak < threshold) return;
    this.missStreak = 0;
    this.scheduler.timeout(() => void this.flushAiBatch(), 3000);
  }

  private async flushAiBatch(): Promise<void> {
    const texts = this.cache.recentIgnoredTexts(20);
    if (texts.length === 0 || !this.aiTranslator.isAvailable) return;
    try {
      const results = await this.aiTranslator.translateBatch(texts);
      let added = 0;
      for (const [original, translated] of results) {
        if (!translated || translated === original) continue;
        this.learn(original, translated);
        this.cache.removeIgnore(original);
        added++;
      }
      if (added > 0) this.logger.success(`AI 翻译新增 ${added} 条规则`);
    } catch (e: any) {
      this.logger.error(`AI 批量翻译失败: ${e?.message ?? e}`);
    }
  }

  // ==================== 文件导入 ====================

  async loadUniversalFile(file: File): Promise<ImportResult> {
    const ext = getFileType(file.name);
    if (!isSupportedFile(file.name)) throw new Error(`不支持的文件格式: .${ext || "?"}`);

    let parsed: any;
    if (ext === "json") {
      const text = await readFileAsText(file);
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("JSON 解析失败");
      }
    } else if (ext === "csv" || ext === "tsv") {
      const text = await readFileAsText(file);
      parsed = parseDelimited(text, ext === "csv" ? "," : "\t");
    } else {
      parsed = await parseXlsx(file);
    }

    // CollData.json → 翻译规则
    if (ext === "json" && isCollDataFormat(parsed)) {
      const rules = parseCollData(parsed);
      this.applyUserRules(rules);
      this.logger.success(`CollData 加载成功: ${file.name}（${rules.length} 条）`);
      return { type: "translation", translationCount: rules.length, aiFixCount: 0 };
    }

    // 对象格式 {原文: 译文} → 翻译规则
    if (ext === "json" && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const maybeAi = extractAiFixRules(parsed);
      if (maybeAi.length > 0 && maybeAi.every((r) => r.aaa && r.ccc)) {
        this.fixRules.addRules(maybeAi);
        this.logger.success(`AI 修正规则加载成功: ${file.name}（${maybeAi.length} 条）`);
        return { type: "aiFix", translationCount: 0, aiFixCount: maybeAi.length };
      }
      const rules = normalizeTranslationData(parsed);
      this.applyUserRules(rules);
      this.logger.success(`翻译文件加载成功: ${file.name}（${rules.length} 条）`);
      return { type: "translation", translationCount: rules.length, aiFixCount: 0 };
    }

    // 数组（CSV/TSV/XLSX）→ 按列数判定
    const rows = filterValidRows(parsed as any[][]);
    if (rows.length === 0) throw new Error("文件中没有有效数据行");
    const kind = detectKind(rows);
    return this.dispatchRows(rows, kind, file.name);
  }

  private dispatchRows(rows: any[][], kind: ImportResult["type"], fileName: string): ImportResult {
    let translationCount = 0;
    let aiFixCount = 0;

    if (kind === "aiFix") {
      const rules = extractAiFixRules(rows);
      this.fixRules.addRules(rules);
      aiFixCount = rules.length;
      this.logger.success(`AI 修正规则加载成功: ${fileName}（${aiFixCount} 条）`);
    } else if (kind === "mixed") {
      const trans: TranslationRuleInput[] = [];
      const ai: AiFixRuleInput[] = [];
      for (const row of rows) {
        const third = String(row[2] ?? "").trim();
        if (third) {
          ai.push({ aaa: String(row[0]).trim(), bbb: String(row[1] ?? "").trim(), ccc: third });
        } else if (row[1]) {
          trans.push({ source: String(row[0]).trim(), target: String(row[1]).trim() });
        }
      }
      if (trans.length) this.applyUserRules(trans);
      if (ai.length) this.fixRules.addRules(ai);
      translationCount = trans.length;
      aiFixCount = ai.length;
      this.logger.success(
        `混合规则加载成功: ${fileName}（翻译 ${translationCount} + AI Fix ${aiFixCount}）`
      );
    } else {
      const trans: TranslationRuleInput[] = rows
        .filter((r) => r.length >= 2 && r[1])
        .map((r) => ({ source: String(r[0]).trim(), target: String(r[1]).trim() }));
      this.applyUserRules(trans);
      translationCount = trans.length;
      this.logger.success(`翻译文件加载成功: ${fileName}（${translationCount} 条）`);
    }
    return { type: kind, translationCount, aiFixCount };
  }

  private applyUserRules(rules: TranslationRuleInput[]): void {
    if (!rules.length) return;
    this.store.setLayer("user", rules, true);
    this.store.rebuildBloom(this.bloom);
    this.statsAt = 0;
    this.scheduleSave();
  }

  /** 兼容旧接口：按文件名从缓存/文件恢复 */
  async loadTranslationData(fileName: string): Promise<void> {
    if (!fileName) return;
    const storageKey = `${STORAGE_KEYS.translationPrefix}${fileName}`;
    const saved = this.storage.get(storageKey);
    if (saved && this.config.get("autoLoad") === true) {
      try {
        const parsed = JSON.parse(saved);
        const rules = this.deserializeUserLayer(parsed);
        if (rules.length) {
          this.store.setLayer("user", rules, true);
          this.store.rebuildBloom(this.bloom);
          this.logger.success(`从缓存恢复翻译数据: ${fileName}`);
          return;
        }
      } catch {
        /* 缓存损坏 → 走文件读取 */
      }
    }
    // 缓存没有命中时，尝试从游戏目录读取（json / csv / tsv）
    const rules = await this.fetchRulesFile(fileName);
    if (rules && rules.length) {
      this.store.setLayer("user", rules, true);
      this.store.rebuildBloom(this.bloom);
      this.logger.success(`翻译文件加载成功: ${fileName}（${rules.length} 条）`);
      return;
    }
    this.logger.info(`未找到 ${fileName} 的本地缓存，请通过面板上传文件`);
  }

  private async fetchRulesFile(
    fileName: string
  ): Promise<TranslationRuleInput[] | null> {
    if (!this.http) return null;
    const ext = getFileType(fileName);
    if (ext !== "json" && ext !== "csv" && ext !== "tsv") return null;
    try {
      const path = await resolveFilePath(fileName);
      const text = await fetchText(path);
      if (ext === "json") return normalizeTranslationData(JSON.parse(text));
      return parseArray(parseDelimited(text, ext === "csv" ? "," : "\t"));
    } catch (e: any) {
      this.logger.warn(`读取 ${fileName} 失败: ${e?.message ?? e}`);
      return null;
    }
  }

  async loadFromFile(file: File): Promise<boolean> {
    try {
      const result = await this.loadUniversalFile(file);
      return result.translationCount > 0 || result.aiFixCount > 0;
    } catch (e: any) {
      this.logger.error(`文件加载失败 [${file.name}]: ${e?.message ?? e}`);
      return false;
    }
  }

  // ==================== AI 修正规则（委托）====================

  getAIFixRules() {
    return this.fixRules.getRules();
  }

  addAIFixRule(aaa: string | RegExp, bbb: string | RegExp | null, ccc: string): void {
    this.fixRules.addRule({ aaa, bbb: bbb ?? "", ccc });
  }

  removeAIFixRule(index: number): boolean {
    return this.fixRules.removeRule(index);
  }

  clearAIFixRules(): void {
    this.fixRules.clear();
  }

  async loadAIFixRules(file: File): Promise<boolean> {
    const ext = getFileType(file.name);
    try {
      if (ext === "json") {
        const parsed = JSON.parse(await readFileAsText(file));
        const rules = extractAiFixRules(parsed);
        this.fixRules.addRules(rules);
        this.logger.success(`AI 修正规则加载成功: ${file.name}（${rules.length} 条）`);
        return true;
      }
      if (ext === "csv" || ext === "tsv") {
        const rows = parseDelimited(await readFileAsText(file), ext === "csv" ? "," : "\t");
        this.fixRules.addRules(extractAiFixRules(rows));
        return true;
      }
      if (ext === "xlsx" || ext === "xls") {
        this.fixRules.addRules(extractAiFixRules(await parseXlsx(file)));
        return true;
      }
      throw new Error(`不支持的文件格式: .${ext}`);
    } catch (e: any) {
      this.logger.error(`AI 修正规则加载失败 [${file.name}]: ${e?.message ?? e}`);
      return false;
    }
  }

  exportAIFixRules(format: "json" | "csv" = "json"): ExportPayload {
    return {
      data: format === "csv" ? this.fixRules.exportCSV() : this.fixRules.exportJSON(),
      fileName: timestampFileName(`AIFixRules_${getGameName()}`, format),
      format,
    };
  }

  // ==================== 规则压缩 / 预翻译 ====================

  compactRules(threshold: number = 4): unknown {
    const { exactMap, regexRules, stats } = compactRules(this.store.getUserExact(), threshold);
    this.store.setUserLayerDirect(exactMap, regexRules);
    this.store.rebuildBloom(this.bloom);
    this.compactStats = stats;
    this.logger.success(
      `规则压缩完成: ${stats.originalCount} → ${stats.compactedCount} 条（压缩率 ${stats.compressionRatio}%）`
    );
    this.statsAt = 0;
    return stats;
  }

  preTranslate(texts: Iterable<string>, options: { writeRules?: boolean } = {}): Map<string, string> {
    const map = this.pipeline.preTranslate(texts, options);
    this.preTranslated = true;
    this.statsAt = 0;
    this.logger.success(`预翻译完成: ${map.size} 条文本已预热到缓存`);
    return map;
  }

  get isPreTranslated(): boolean {
    return this.preTranslated;
  }

  // ==================== 导出 / 持久化 ====================

  exportTranslationData(format: "json" | "csv" | "tsv" = "json"): ExportPayload {
    const entries = this.cache.exportEntries();
    const merged = new Map<string, string>();
    for (const [k, v] of entries) if (!merged.has(k)) merged.set(k, v);
    for (const [k, v] of this.store.snapshot().exact) if (!merged.has(k)) merged.set(k, v);

    if (format === "json") {
      const obj: Record<string, string> = {};
      for (const [k, v] of merged) obj[k] = v;
      return {
        data: obj,
        fileName: timestampFileName(`Translation_${getGameName()}`, "json"),
        format,
      };
    }
    const rows: string[][] = [["source", "target"]];
    for (const [k, v] of merged) rows.push([k, v]);
    return {
      data: rows,
      fileName: timestampFileName(`Translation_${getGameName()}`, format),
      format,
    };
  }

  exportTranslationText(format: "json" | "csv" | "tsv" = "json"): string {
    const { data } = this.exportTranslationData(format);
    if (format === "json") return JSON.stringify(data, null, 2);
    return stringifyDelimited(data as string[][], format === "csv" ? "," : "\t");
  }

  saveUserData(immediate = false): void {
    if (this.config.get("autoLoad") !== true) return;
    const fileName = String(this.config.get("fileName") ?? "default.json");
    const payload = JSON.stringify({
      version: 3,
      exact: Array.from(this.store.getUserExact().entries()),
      regex: this.store.getUserRegex().map((r) => ({
        source: r.pattern.source,
        flags: r.pattern.flags,
        replacement: r.replacement,
      })),
    });
    const key = `${STORAGE_KEYS.translationPrefix}${fileName}`;
    if (immediate) {
      this.saveScheduled?.cancel();
      this.storage.set(key, payload);
      this.saveCache(immediate);
      return;
    }
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (!this.saveScheduled) {
      this.saveScheduled = this.scheduler.debounce(() => {
        this.storage.set(
          `${STORAGE_KEYS.translationPrefix}${String(this.config.get("fileName") ?? "default.json")}`,
          JSON.stringify({
            version: 3,
            exact: Array.from(this.store.getUserExact().entries()),
            regex: this.store.getUserRegex().map((r) => ({
              source: r.pattern.source,
              flags: r.pattern.flags,
              replacement: r.replacement,
            })),
          })
        );
        this.saveCache(false);
      }, 2000);
    }
    this.saveScheduled();
  }

  private cacheSaveScheduled: { cancel(): void; flush(): void } | null = null;

  private saveCache(immediate: boolean): void {
    const write = () =>
      this.storage.set(STORAGE_KEYS.cache, JSON.stringify(this.cache.exportEntries(10000)));
    if (immediate) {
      this.cacheSaveScheduled?.cancel();
      write();
      return;
    }
    if (!this.cacheSaveScheduled) {
      this.cacheSaveScheduled = this.scheduler.debounce(write, 2000);
    }
    this.cacheSaveScheduled();
  }

  private restoreCache(): void {
    if (this.config.get("autoLoad") !== true) return;
    const raw = this.storage.get(STORAGE_KEYS.cache);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const count = this.cache.importEntries(parsed);
      if (count > 0) this.logger.info(`恢复翻译缓存 ${count} 条`);
    } catch {
      this.logger.warn("翻译缓存恢复失败，已忽略损坏数据");
    }
  }

  private deserializeUserLayer(parsed: any): TranslationRuleInput[] {
    const rules: TranslationRuleInput[] = [];
    if (Array.isArray(parsed)) return normalizeTranslationData(parsed);
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of parsed.exact ?? []) rules.push({ source: k, target: v });
      for (const r of parsed.regex ?? []) {
        try {
          rules.push({ source: new RegExp(r.source, r.flags || "g"), target: r.replacement });
        } catch {
          /* 忽略非法正则 */
        }
      }
    }
    return rules;
  }

  reset(): void {
    this.store.clearLayer("user");
    this.store.clearLayer("learned");
    this.cache.clear();
    this.fixRules.clear();
    this.store.rebuildBloom(this.bloom);
    this.preTranslated = false;
    this.compactStats = null;
    this.aiLearnedCount = 0;
    this.missStreak = 0;
    this.statsAt = 0;
    this.storage.remove(STORAGE_KEYS.cache);
    this.storage.remove(
      `${STORAGE_KEYS.translationPrefix}${String(this.config.get("fileName") ?? "default.json")}`
    );
    this.logger.warn("所有用户翻译数据已重置（默认规则保留）");
  }

  // ==================== 统计 ====================

  get stats(): TranslatorStats {
    const now = Date.now();
    if (this.statsCache && now - this.statsAt < 800) return this.statsCache;
    const hitRate = this.cache.hitRate;
    const aiFix = this.fixRules.getStats();
    this.statsCache = {
      rules: this.store.totalCount,
      exactRules: this.store.exactCount,
      regexRules: this.store.regexCount,
      defaultRules: this.store.defaultCount,
      userRules: this.store.userCount,
      learnedRules: this.store.learnedCount,
      aiLearnedCount: this.aiLearnedCount,
      cacheSize: this.cache.size,
      ignoreSize: this.cache.ignoreSize,
      cacheHitRate: hitRate.hitRate,
      cacheTotal: hitRate.total,
      bloomInsertions: this.bloom.count,
      bloomBytes: this.bloom.byteSize,
      bloomFillRatio: +this.bloom.fillRatio.toFixed(3),
      preTranslated: this.preTranslated,
      compactStats: this.compactStats,
      aiFixRules: aiFix.total,
      aiFixHits: aiFix.hits,
      aiFixLastFix: aiFix.lastFix,
    };
    this.statsAt = now;
    return this.statsCache;
  }
}
