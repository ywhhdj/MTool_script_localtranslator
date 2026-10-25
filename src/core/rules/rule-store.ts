/**
 * rules/rule-store.ts — 规则库（分层存储 + 索引）
 *
 *   1. 「分层存储 + 按层查询」，不再合并，写入是 O(1)；
 *   2. 精确查询顺序 learned → user → default，天然保证用户/学习优先级
 *   3. 正则按层建立分块索引，用户规则优先应用；
 *   4. Bloom 只在「规则集整体变化」或「增量学习」时更新单条
 */

import type { RegexRule, RuleSet, TranslationRuleInput } from "../domain/types";
import { RegexRuleIndex } from "../datastruct/regex-index";
import type { BloomFilter } from "../datastruct/bloom-filter";

export type LayerName = "default" | "user" | "learned";

class RuleLayer {
  readonly name: LayerName;
  exact = new Map<string, string>();
  regex: RegexRule[] = [];
  readonly index: RegexRuleIndex;

  constructor(name: LayerName, chunkSize: number) {
    this.name = name;
    this.index = new RegexRuleIndex(chunkSize);
  }

  rebuildIndex(): void {
    this.index.reset(this.regex);
  }

  get count(): number {
    return this.exact.size + this.regex.length;
  }
}

export interface RuleStoreOptions {
  chunkSize?: number;
}

export class RuleStore {
  private layers: Record<LayerName, RuleLayer>;
  /** 精确查询的优先级：学习 > 用户 > 默认 */
  private lookupOrder: LayerName[] = ["learned", "user", "default"];
  /** 正则应用顺序：用户 > 默认（学习层只存精确） */
  private applyOrder: LayerName[] = ["user", "default"];

  constructor(options: RuleStoreOptions = {}) {
    const chunkSize = options.chunkSize ?? 48;
    this.layers = {
      default: new RuleLayer("default", chunkSize),
      user: new RuleLayer("user", chunkSize),
      learned: new RuleLayer("learned", chunkSize),
    };
  }

  // ==================== 写入 ====================

  private split(rules: TranslationRuleInput[]): RuleSet {
    const set: RuleSet = { exact: new Map(), regex: [] };
    for (const rule of rules) {
      if (!rule) continue;
      if (typeof rule.source === "string") {
        if (rule.source) set.exact.set(rule.source, rule.target);
      } else if (rule.source instanceof RegExp) {
        set.regex.push({ pattern: rule.source, replacement: rule.target });
      }
    }
    // 长 pattern 优先：避免短规则先吃掉文本
    set.regex.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
    return set;
  }

  /** 覆盖写入某一层（false 表示增量追加） */
  setLayer(layer: LayerName, rules: TranslationRuleInput[], replace = true): void {
    const target = this.layers[layer];
    const set = this.split(rules);
    if (replace) {
      target.exact = set.exact;
      target.regex = set.regex;
    } else {
      for (const [k, v] of set.exact) target.exact.set(k, v);
      target.regex.push(...set.regex);
      target.regex.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
    }
    target.rebuildIndex();
  }

  /** 增量写入一条已学译文（O(1)，不触发任何重建） */
  addLearned(source: string, target: string): boolean {
    if (!source || !target || source === target) return false;
    const layer = this.layers.learned;
    if (layer.exact.has(source)) return false;
    layer.exact.set(source, target);
    return true;
  }

  clearLayer(layer: LayerName): void {
    const target = this.layers[layer];
    target.exact = new Map();
    target.regex = [];
    target.rebuildIndex();
  }

  // ==================== 查询 ====================

  lookupExact(text: string): string | undefined {
    for (const name of this.lookupOrder) {
      const hit = this.layers[name].exact.get(text);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }

  /**
   * 应用正则规则。maxReplace 跨层共享（用户规则先消耗配额）。
   * 返回替换后的文本。
   */
  applyRegex(text: string, maxReplace: number = 1): string {
    let result = text;
    let budget = maxReplace;
    for (const name of this.applyOrder) {
      if (budget <= 0) break;
      const before = result;
      const next = this.layers[name].index.apply(result, budget);
      if (next !== before) {
        // 粗略估算已消耗配额：无法确定单条规则消耗了几条，按是否变化递减
        result = next;
        budget = Math.max(0, budget - 1);
      }
    }
    return result;
  }

  // ==================== Bloom 同步 ====================

  /** 全量重建（规则集整体替换后调用） */
  rebuildBloom(bloom: BloomFilter): void {
    bloom.reserve(this.exactCount);
    bloom.clear();
    for (const name of this.lookupOrder) {
      for (const key of this.layers[name].exact.keys()) bloom.add(key);
    }
  }

  /** 增量添加（学习到新译文时调用，避免全表重建） */
  addToBloom(bloom: BloomFilter, key: string): void {
    bloom.add(key);
  }

  // ==================== 统计 / 快照 ====================

  get exactCount(): number {
    return (
      this.layers.default.exact.size +
      this.layers.user.exact.size +
      this.layers.learned.exact.size
    );
  }

  get regexCount(): number {
    return this.layers.default.regex.length + this.layers.user.regex.length;
  }

  get defaultCount(): number {
    return this.layers.default.count;
  }

  get userCount(): number {
    return this.layers.user.count;
  }

  get learnedCount(): number {
    return this.layers.learned.count;
  }

  get totalCount(): number {
    return this.defaultCount + this.userCount + this.learnedCount;
  }

  /** 合并视图：仅在导出/持久化时按需构造 */
  snapshot(): { exact: Map<string, string>; regex: RegexRule[] } {
    const exact = new Map<string, string>();
    const regex: RegexRule[] = [];
    for (const name of ["default", "user", "learned"] as LayerName[]) {
      for (const [k, v] of this.layers[name].exact) if (!exact.has(k)) exact.set(k, v);
      if (name !== "learned") regex.push(...this.layers[name].regex);
    }
    return { exact, regex };
  }

  /** 用户层序列化（持久化用，不含默认规则与学习结果） */
  exportUserLayer(): {
    exact: Array<[string, string]>;
    regex: Array<{ source: string; flags: string; replacement: string }>;
  } {
    const layer = this.layers.user;
    return {
      exact: Array.from(layer.exact.entries()),
      regex: layer.regex.map((r) => ({
        source: r.pattern.source,
        flags: r.pattern.flags,
        replacement: r.replacement,
      })),
    };
  }

  /** 用户层精确表（压缩等场景需要原地改写） */
  getUserExact(): Map<string, string> {
    return this.layers.user.exact;
  }

  getUserRegex(): RegexRule[] {
    return this.layers.user.regex;
  }

  setUserLayerDirect(exact: Map<string, string>, regex: RegexRule[]): void {
    const layer = this.layers.user;
    layer.exact = exact;
    layer.regex = regex.slice().sort((a, b) => b.pattern.source.length - a.pattern.source.length);
    layer.rebuildIndex();
  }
}
