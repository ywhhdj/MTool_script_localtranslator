/**
 * rules/ai-fix-rules.ts — aaa/bbb/ccc 后修正引擎
 *
 *   1. 字符串 aaa 走 Map（O(1)），正则 aaa 走分块快筛；
 *   2. bbb 为空 = 直接返回 ccc；
 *   3. bbb 为字符串时「全部替换」处理，
 *   4. 统计增量维护
 *   5. 规则顺序稳定（order 数组），删除按展示索引
 */

import type { AiFixRule, AiFixRuleInput } from "../domain/types";
import { RegexRuleIndex } from "../datastruct/regex-index";

interface CompiledRule {
  aaa: string | RegExp;
  bbb: string | RegExp | "";
  ccc: string;
  isRegex: boolean;
}

export interface AiFixStats {
  total: number;
  exactRules: number;
  regexRules: number;
  hits: number;
  lastFix: string;
}

const REGEX_LITERAL = /^\/(.+?)\/([gimsuy]*)$/;

export function parseRegexLiteral(value: unknown): string | RegExp {
  if (value instanceof RegExp) return ensureGlobal(value);
  if (typeof value !== "string") return value === undefined || value === null ? "" : String(value);
  const m = value.match(REGEX_LITERAL);
  if (!m) return value;
  try {
    const flags = m[2] || "g";
    return new RegExp(m[1], flags.includes("g") ? flags : flags + "g");
  } catch {
    return value; // 解析失败 → 当作普通字符串，绝不丢规则
  }
}

export function isRegexPattern(value: unknown): boolean {
  if (value instanceof RegExp) return true;
  if (typeof value !== "string") return false;
  return REGEX_LITERAL.test(value);
}

function ensureGlobal(re: RegExp): RegExp {
  return re.flags.includes("g") ? re : new RegExp(re.source, re.flags + "g");
}

export class AiFixRulesEngine {
  /** 字符串 aaa → 规则组 */
  private exactMap = new Map<string, CompiledRule[]>();
  /** 正则 aaa 规则（按插入顺序） */
  private regexRules: CompiledRule[] = [];
  /** 正则 aaa 的分块快筛 */
  private regexIndex = new RegexRuleIndex(32);
  /** 展示/删除顺序 */
  private order: CompiledRule[] = [];

  private hits = 0;
  private lastFix = "";

  // ==================== 规则管理 ====================

  addRule(input: AiFixRuleInput): CompiledRule {
    const aaa = parseRegexLiteral(input.aaa);
    const bbbRaw = input.bbb ?? "";
    const bbb = bbbRaw === null || bbbRaw === undefined ? "" : parseRegexLiteral(bbbRaw);
    const rule: CompiledRule = {
      aaa,
      bbb,
      ccc: String(input.ccc ?? ""),
      isRegex: aaa instanceof RegExp || bbb instanceof RegExp,
    };
    this.insert(rule);
    return rule;
  }

  addRules(inputs: AiFixRuleInput[]): number {
    for (const input of inputs) this.addRule(input);
    return inputs.length;
  }

  private insert(rule: CompiledRule): void {
    this.order.push(rule);
    if (typeof rule.aaa === "string") {
      const list = this.exactMap.get(rule.aaa);
      if (list) list.push(rule);
      else this.exactMap.set(rule.aaa, [rule]);
    } else {
      this.regexRules.push(rule);
      this.regexIndex.reset(
        this.regexRules.map((r) => ({ pattern: r.aaa as RegExp, replacement: "" }))
      );
    }
  }

  removeRule(index: number): boolean {
    if (index < 0 || index >= this.order.length) return false;
    const [removed] = this.order.splice(index, 1);
    if (typeof removed.aaa === "string") {
      const list = this.exactMap.get(removed.aaa);
      if (list) {
        const i = list.indexOf(removed);
        if (i >= 0) list.splice(i, 1);
        if (list.length === 0) this.exactMap.delete(removed.aaa);
      }
    } else {
      const i = this.regexRules.indexOf(removed);
      if (i >= 0) {
        this.regexRules.splice(i, 1);
        this.regexIndex.reset(
          this.regexRules.map((r) => ({ pattern: r.aaa as RegExp, replacement: "" }))
        );
      }
    }
    return true;
  }

  clear(): number {
    const count = this.order.length;
    this.order = [];
    this.exactMap.clear();
    this.regexRules = [];
    this.regexIndex.reset([]);
    this.hits = 0;
    this.lastFix = "";
    return count;
  }

  get count(): number {
    return this.order.length;
  }

  getRules(): AiFixRule[] {
    return this.order.map((r) => ({
      aaa: r.aaa,
      bbb: r.bbb,
      ccc: r.ccc,
      isRegex: r.isRegex,
    }));
  }

  // ==================== 核心匹配 ====================

  /** 原文命中任意 aaa（用于「是否需要走 AI」的判断） */
  shouldIntercept(original: string): boolean {
    if (!original || typeof original !== "string") return false;
    if (this.exactMap.has(original)) return true;
    if (this.regexRules.length === 0) return false;
    // 分块快筛：整块都不命中时一次跳过（块内规则数 >> 块数）
    if (this.regexIndex.countMatchingChunks(original) === 0) return false;
    for (const rule of this.regexRules) {
      const re = rule.aaa as RegExp;
      re.lastIndex = 0;
      if (re.test(original)) return true;
    }
    return false;
  }

  /** 返回修正后的译文（无命中则原样返回） */
  fix(original: string, aiResult: string): string {
    if (!original || !aiResult) return aiResult;
    if (typeof original !== "string" || typeof aiResult !== "string") return aiResult;

    // 1) 精确 aaa：O(1)
    const exactGroup = this.exactMap.get(original);
    if (exactGroup) {
      for (const rule of exactGroup) {
        if (!this.matchBbb(rule, aiResult)) continue;
        const fixed = this.applyCcc(rule, aiResult);
        if (fixed !== aiResult) return this.recordHit(original, fixed);
      }
    }

    // 2) 正则 aaa：分块快筛后逐条
    if (this.regexRules.length > 0 && this.regexIndex.countMatchingChunks(original) > 0) {
      for (const rule of this.regexRules) {
        const re = rule.aaa as RegExp;
        re.lastIndex = 0;
        if (!re.test(original)) continue;
        if (!this.matchBbb(rule, aiResult)) continue;
        const fixed = this.applyCcc(rule, aiResult);
        if (fixed !== aiResult) return this.recordHit(original, fixed);
      }
    }

    return aiResult;
  }

  private recordHit(original: string, fixed: string): string {
    this.hits++;
    this.lastFix = `${original.slice(0, 20)} → ${fixed.slice(0, 40)}`;
    return fixed;
  }

  private matchBbb(rule: CompiledRule, aiResult: string): boolean {
    if (!rule.bbb) return true;
    if (rule.bbb instanceof RegExp) {
      rule.bbb.lastIndex = 0;
      return rule.bbb.test(aiResult);
    }
    return aiResult.includes(rule.bbb);
  }

  private applyCcc(rule: CompiledRule, aiResult: string): string {
    // bbb 为空：直接整体替换为 ccc（与 README 描述一致）
    if (!rule.bbb) return rule.ccc || aiResult;
    if (rule.bbb instanceof RegExp) {
      rule.bbb.lastIndex = 0;
      return aiResult.replace(rule.bbb, rule.ccc);
    }
    // 字符串 bbb：全量替换（与正则分支的 g 行为一致）
    return aiResult.split(rule.bbb).join(rule.ccc);
  }

  // ==================== 统计 ====================

  getStats(): AiFixStats {
    return {
      total: this.order.length,
      exactRules: this.exactMap.size,
      regexRules: this.regexRules.length,
      hits: this.hits,
      lastFix: this.lastFix,
    };
  }

  // ==================== 导入导出 ====================

  exportJSON(): Array<{ aaa: string; bbb: string; ccc: string }> {
    return this.order.map((r) => ({
      aaa: r.aaa instanceof RegExp ? `/${r.aaa.source}/${r.aaa.flags}` : String(r.aaa),
      bbb:
        r.bbb instanceof RegExp ? `/${r.bbb.source}/${r.bbb.flags}` : String(r.bbb || ""),
      ccc: r.ccc,
    }));
  }

  exportCSV(): string[][] {
    const rows: string[][] = [["aaa", "bbb", "ccc"]];
    for (const r of this.order) {
      rows.push([
        r.aaa instanceof RegExp ? `/${r.aaa.source}/${r.aaa.flags}` : String(r.aaa),
        r.bbb instanceof RegExp ? `/${r.bbb.source}/${r.bbb.flags}` : String(r.bbb || ""),
        String(r.ccc),
      ]);
    }
    return rows;
  }
}
