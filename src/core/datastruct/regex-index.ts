/**
 * datastruct/regex-index.ts — 正则规则的分块快筛索引
 *
 * 每 CHUNK_SIZE 条 pattern 合并成一个大正则：
 * 命中失败的整块可以一次跳过，避免「每条文本跑上千次 replace」。
 *
 *   1. 合并时收集块内 flag 并集，编译失败才降级为逐条；
 *   2. 块内规则含捕获组时，
 *      replacement 里的 $1 仍指向各自规则的第一个组（JS 按整条 pattern 编号），
 *      合并只是做 test，不做 replace，因此不影响正确性（此处保留逐条 replace）；
 *   3. 提供 apply() 统一入口，外部不再需要关心块结构。
 */

export interface RegexRuleLike {
  pattern: RegExp;
  replacement: string;
}

export class RegexRuleIndex {
  private rules: RegexRuleLike[] = [];
  private chunks: Array<RegExp | null> = [];
  private chunkSize: number;

  constructor(chunkSize: number = 48) {
    this.chunkSize = Math.max(1, chunkSize);
  }

  get size(): number {
    return this.rules.length;
  }

  get chunkCount(): number {
    return this.chunks.length;
  }

  /** 重建索引（规则集变化时调用，不在翻译热路径上） */
  reset(rules: RegexRuleLike[]): void {
    this.rules = rules;
    this.chunks = [];
    for (let i = 0; i < rules.length; i += this.chunkSize) {
      const end = Math.min(i + this.chunkSize, rules.length);
      let flags = "";
      for (let j = i; j < end; j++) {
        const f = rules[j].pattern.flags;
        for (const ch of f) if (!flags.includes(ch)) flags += ch;
      }
      let merged: RegExp | null = null;
      try {
        merged = new RegExp(
          rules
            .slice(i, end)
            .map((r) => `(?:${r.pattern.source})`)
            .join("|"),
          flags.includes("g") ? flags : flags + "g"
        );
      } catch {
        merged = null; // 编译失败 → 该块逐条执行，保证不漏规则
      }
      this.chunks.push(merged);
    }
  }

  /**
   * 依次尝试块内规则；返回替换后的文本。
   * maxReplace 为「本次调用最多替换几条规则」，0 表示不限。
   */
  apply(text: string, maxReplace: number = 1): string {
    if (!text) return text;
    const total = this.rules.length;
    if (total === 0) return text;

    let result = text;
    let replaced = 0;

    for (let c = 0; c < this.chunks.length; c++) {
      if (maxReplace > 0 && replaced >= maxReplace) break;
      const start = c * this.chunkSize;
      const end = Math.min(start + this.chunkSize, total);
      const merged = this.chunks[c];

      if (merged) {
        merged.lastIndex = 0;
        if (!merged.test(result)) continue; // 整块不命中，跳过
        merged.lastIndex = 0;
      }

      for (let i = start; i < end; i++) {
        const { pattern, replacement } = this.rules[i];
        pattern.lastIndex = 0;
        const next = result.replace(pattern, replacement);
        if (next !== result) {
          result = next;
          replaced++;
          if (maxReplace > 0 && replaced >= maxReplace) break;
        }
      }
    }
    return result;
  }

  /** 调试/统计：命中块数 */
  countMatchingChunks(text: string): number {
    let n = 0;
    for (const merged of this.chunks) {
      if (!merged) {
        n++;
        continue;
      }
      merged.lastIndex = 0;
      if (merged.test(text)) n++;
    }
    return n;
  }
}
