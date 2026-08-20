/**
 * aiFixRules.ts — AI 翻译后修正规则引擎（修复版）
 *
 * 修复（Bug 修复）：
 *  - 新增 removeRule(index) 方法，避免"清空全部再逐个加回"的低效操作
 *  - 统一规则解析逻辑
 *
 * 核心概念：
 *   MTool 平台内置 AI 翻译通过 WebSocket 发送原文，返回 AI 翻译结果。
 *   AI 翻译质量不稳定，本模块在 AI 结果返回后、交给游戏引擎前做后处理修正：
 *
 *   原文 → MTool AI → AI译文 → ★aiFixRules修正★ → 最终文本
 *
 * 规则格式（三字段）：
 *   aaa: 原文 / 原文正则（用于匹配"什么文本需要走 AI"）
 *   bbb: AI 译文中需要包含的文本 / 正则（空=不检查）
 *   ccc: 替换结果
 */

import { getFileType, getGameName, parseDelimited, parseRegex, parseXLSX, safeJSONParse, timestampFileName } from '../utils';
import logger, { LogLevel } from './logger';

// ==================== 类型定义 ====================

export interface AIFixRule {
  aaa: string | RegExp;
  bbb: string | RegExp;
  ccc: string;
  _isRegex?: boolean;
}

export interface AIFixStats {
  total: number;
  exactRules: number;
  regexRules: number;
  hits: number;
  lastFix: string;
}

// ==================== 规则解析工具 ====================

export function parseRuleItem(item: any): AIFixRule | null {
  if (!item) return null;

  // 数组格式: [aaa, bbb, ccc]
  if (Array.isArray(item) && item.length >= 3) {
    return makeRule(item[0], item[1], item[2]);
  }

  // 对象格式
  if (typeof item === 'object') {
    const aaa = item.aaa ?? item.source ?? item.original ?? '';
    const bbb = item.bbb ?? item.pattern ?? item.match ?? '';
    const ccc = item.ccc ?? item.target ?? item.replacement ?? item.fix ?? '';
    if (!aaa || !ccc) return null;
    return makeRule(aaa, bbb, ccc);
  }

  return null;
}

export function extractRules(data: any): AIFixRule[] {
  const rules: AIFixRule[] = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      const rule = parseRuleItem(item);
      if (rule) rules.push(rule);
    }
    return rules;
  }

  if (typeof data === 'object' && data !== null) {
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length >= 2) {
        if (value.length >= 3) {
          rules.push(makeRule(value[0], value[1], value[2]));
        } else {
          rules.push(makeRule(key, value[0], value[1]));
        }
      } else if (typeof value === 'string') {
        rules.push(makeRule(key, '', value));
      } else if (typeof value === 'object' && value !== null) {
        const rule = parseRuleItem({
          ...value,
          aaa: (value as any).aaa || key
        });
        if (rule) rules.push(rule);
      }
    }
  }

  return rules;
}

export function makeRule(aaaRaw: any, bbbRaw: any, cccRaw: any): AIFixRule {
  const aaa = parseValue(aaaRaw);
  const bbb = parseValue(bbbRaw);
  const isRegex = aaa instanceof RegExp || bbb instanceof RegExp;
  return {
    aaa,
    bbb,
    ccc: String(cccRaw || ''),
    _isRegex: isRegex,
  };
}

function parseValue(val: any): string | RegExp {
  if (val === undefined || val === null) return '';
  if (val instanceof RegExp) {
    if (!val.flags.includes('g')) {
      return new RegExp(val.source, val.flags + 'g');
    }
    return val;
  }
  if (typeof val !== 'string') return String(val);
  const parsed = parseRegex(val);
  return parsed;
}

// ==================== 引擎类 ====================

class AIFixRulesEngine {
  private rules: AIFixRule[] = [];
  private stats: AIFixStats = {
    total: 0,
    exactRules: 0,
    regexRules: 0,
    hits: 0,
    lastFix: '',
  };

  addRule(rule: AIFixRule): void {
    this.rules.push(rule);
    this._recalcStats();
    console.log(`[MToolTranslatorPlugin][AIFix] ➕ 规则: "${String(rule.aaa).slice(0, 20)}" → "${rule.ccc.slice(0, 30)}"`);
  }

  addRules(rules: AIFixRule[]): void {
    this.rules.push(...rules);
    this._recalcStats();
    console.log(`[MToolTranslatorPlugin][AIFix] ➕ 批量添加 ${rules.length} 条规则`);
  }

  removeRule(index: number): boolean {
    if (index < 0 || index >= this.rules.length) {
      logger.addLog(`[AIFix] 删除失败：索引 ${index} 越界`, LogLevel.WARNING);
      return false;
    }
    const removed = this.rules.splice(index, 1)[0];
    this._recalcStats();
    console.log(`[MToolTranslatorPlugin][AIFix] ➖ 删除规则 #${index}: "${String(removed.aaa).slice(0, 20)}"`);
    logger.addLog(`AI 修正规则已删除 #${index}`, LogLevel.INFO);
    return true;
  }

  clear(): void {
    const count = this.rules.length;
    this.rules = [];
    this.stats = { total: 0, exactRules: 0, regexRules: 0, hits: 0, lastFix: '' };
    console.log(`[MToolTranslatorPlugin][AIFix] 🧹 清空 ${count} 条规则`);
    logger.addLog('AI 修正规则已清空', LogLevel.INFO);
  }

  getRules(): AIFixRule[] {
    return [...this.rules];
  }

  get count(): number {
    return this.rules.length;
  }

  // ==================== 核心匹配逻辑 ====================

  fix(original: string, aiResult: string): string {
    if (!original || !aiResult) return aiResult;
    if (typeof original !== 'string' || typeof aiResult !== 'string') return aiResult;

    for (const rule of this.rules) {
      if (!this._matchAAA(rule, original)) continue;

      const bbbMatch = this._matchBBB(rule, aiResult);
      if (!bbbMatch) continue;

      const fixed = this._applyCCC(rule, aiResult);
      if (fixed !== aiResult) {
        this.stats.hits++;
        this.stats.lastFix = `${original.slice(0, 20)} → ${fixed.slice(0, 40)}`;
        console.log(`[MToolTranslatorPlugin][AIFix] ✏️ "${aiResult.slice(0, 20)}..." → "${fixed.slice(0, 30)}..."`);
        return fixed;
      }
    }

    return aiResult;
  }

  shouldIntercept(original: string): boolean {
    if (!original) return false;
    if (typeof original !== 'string') return false;
    for (const rule of this.rules) {
      if (this._matchAAA(rule, original)) return true;
    }
    return false;
  }

  // ==================== 匹配内部方法 ====================

  private _matchAAA(rule: AIFixRule, original: string): boolean {
    if (rule._isRegex && rule.aaa instanceof RegExp) {
      rule.aaa.lastIndex = 0;
      return rule.aaa.test(original);
    }
    return original === rule.aaa;
  }

  private _matchBBB(rule: AIFixRule, aiResult: string): boolean {
    if (!rule.bbb) return true;
    if (rule._isRegex && rule.bbb instanceof RegExp) {
      rule.bbb.lastIndex = 0;
      const m = rule.bbb.exec(aiResult);
      return !!m;
    }
    return aiResult.includes(rule.bbb as string);
  }

  private _applyCCC(rule: AIFixRule, aiResult: string): string {
    if (!rule.bbb) {
      return rule.ccc || aiResult;
    }
    if (rule._isRegex && rule.bbb instanceof RegExp) {
      rule.bbb.lastIndex = 0;
      return aiResult.replace(rule.bbb, rule.ccc);
    }
    const bbbStr = rule.bbb as string;
    return aiResult.replace(bbbStr, rule.ccc);
  }

  // ==================== 统计 ====================

  getStats(): AIFixStats {
    return { ...this.stats };
  }

  // ==================== 导入 / 导出 ====================

  async loadFromFile(file: File): Promise<boolean> {
    try {
      const ext = getFileType(file.name);

      if (ext === 'json') {
        const text = await file.text();
        const data = safeJSONParse(text);
        const rules = extractRules(data);
        this.addRules(rules);
        logger.addLog(`AI 修正规则加载成功: ${file.name}（${rules.length} 条）`, LogLevel.SUCCESS);
        return true;
      }

      if (ext === 'csv' || ext === 'tsv') {
        const text = await file.text();
        const delimiter = ext === 'csv' ? ',' : '\t';
        const rows = parseDelimited(text, delimiter);
        const rules = rows
          .filter(row => row.length >= 3 && row[0] && row[2])
          .map(row => makeRule(row[0], row[1] || '', row[2]));
        this.addRules(rules);
        logger.addLog(`AI 修正规则加载成功: ${file.name}（${rules.length} 条）`, LogLevel.SUCCESS);
        return true;
      }

      if (ext === 'xlsx' || ext === 'xls') {
        const rows = await parseXLSX(file);
        const rules = rows
          .filter((row: any[]) => row.length >= 3 && row[0] && row[2])
          .map((row: any[]) => makeRule(row[0], row[1] || '', row[2]));
        this.addRules(rules);
        logger.addLog(`AI 修正规则加载成功: ${file.name}（${rules.length} 条）`, LogLevel.SUCCESS);
        return true;
      }

      throw new Error(`不支持的文件格式: .${ext}`);
    } catch (e: any) {
      logger.addLog(`AI 修正规则加载失败 [${file.name}]: ${e.message}`, LogLevel.ERROR);
      return false;
    }
  }

  exportJSON(): {
    data: any;
    fileName: string
  } {
    const arr = this.rules.map(r => ({
      aaa: r.aaa instanceof RegExp ? `/${r.aaa.source}/${r.aaa.flags}` : r.aaa,
      bbb: r.bbb instanceof RegExp ? `/${r.bbb.source}/${r.bbb.flags}` : (r.bbb || ''),
      ccc: r.ccc,
    }));
    return {
      data: arr,
      fileName: timestampFileName(`AIFixRules_${getGameName()}`, "json") ,
    };
  }

  exportCSV(): {
    data: string[][];
    fileName: string
  } {
    const rows: string[][] = [['aaa', 'bbb', 'ccc']];
    for (const r of this.rules) {
      rows.push([
        r.aaa instanceof RegExp ? `/${r.aaa.source}/${r.aaa.flags}` : String(r.aaa),
        r.bbb instanceof RegExp ? `/${r.bbb.source}/${r.bbb.flags}` : String(r.bbb || ''),
        String(r.ccc),
      ]);
    }
    return {
      data: rows,
      fileName: timestampFileName(`AIFixRules_${getGameName()}`, "csv")
    };
  }

  // ==================== 内部 ====================

  private _recalcStats() {
    let exact = 0;
    let regex = 0;
    for (const r of this.rules) {
      if (r._isRegex) regex++;
      else exact++;
    }
    this.stats.total = this.rules.length;
    this.stats.exactRules = exact;
    this.stats.regexRules = regex;
  }
}

const aiFixRules = new AIFixRulesEngine();
export default aiFixRules;