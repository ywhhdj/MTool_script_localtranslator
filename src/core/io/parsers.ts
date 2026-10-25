/**
 * io/parsers.ts — 把各种「用户文件」解析成标准规则
 *
 * 单一职责：只做「数据 → 规则」的纯转换，不碰 File、不碰 DOM、不写缓存。
 */

import type { TranslationRuleInput, AiFixRuleInput } from "../domain/types";
import { parseRegexLiteral } from "../rules/ai-fix-rules";

/** { "原文": "译文" } 形式，键为 /xxx/ 时按正则处理 */
export function parseJsonObject(data: Record<string, any>): TranslationRuleInput[] {
  const rules: TranslationRuleInput[] = [];
  if (!data || typeof data !== "object") return rules;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== "string" || !key || !value) continue;
    const parsed = parseRegexLiteral(key);
    rules.push({
      source: parsed instanceof RegExp ? parsed : key,
      target: value,
    });
  }
  return rules;
}

/**
 * 二维数组：
 *   [src, tgt]           → 精确规则
 *   [src, pattern, tgt]  → 第二列是正则（CollData 风格）
 */
export function parseArray(rows: any[]): TranslationRuleInput[] {
  const rules: TranslationRuleInput[] = [];
  if (!Array.isArray(rows)) return rules;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const [src, pattern, tgt] = row;
    if (row.length >= 3 && pattern) {
      const regex = parseRegexLiteral(pattern);
      rules.push({
        source: regex instanceof RegExp ? regex : String(src ?? ""),
        target: String(tgt ?? pattern),
      });
      continue;
    }
    const regex = parseRegexLiteral(src);
    rules.push({
      source: regex instanceof RegExp ? regex : String(src ?? ""),
      target: String(pattern ?? ""),
    });
  }
  return rules.filter((r) => r.source !== "" && r.target !== "");
}

export function isCollDataFormat(data: any): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const firstKey = Object.keys(data)[0];
  if (!firstKey) return false;
  const firstVal = data[firstKey];
  return !!(
    firstVal &&
    typeof firstVal === "object" &&
    Array.isArray(firstVal.data) &&
    firstVal.data.length > 0
  );
}

/** CollData.json：{ id: { type:'trs', data: [[src, pattern, tgt], ...] } } */
export function parseCollData(data: Record<string, any>): TranslationRuleInput[] {
  const rules: TranslationRuleInput[] = [];
  if (!data || typeof data !== "object") return rules;
  for (const key of Object.keys(data)) {
    const item = data[key];
    if (!item || item.type !== "trs" || !Array.isArray(item.data)) continue;
    for (const row of item.data) {
      if (!Array.isArray(row) || row.length < 3) continue;
      const src = String(row[0] ?? "").trim();
      const tgt = String(row[2] ?? "").trim();
      if (!src || !tgt) continue;
      if (src.startsWith("【") || src.startsWith("[")) continue; // 注释行
      const parsed = typeof row[1] === "string" ? parseRegexLiteral(row[1]) : null;
      rules.push({
        source: parsed instanceof RegExp ? parsed : src,
        target: tgt,
      });
    }
  }
  return rules;
}

/** 统一入口：任意结构 → 规则数组 */
export function normalizeTranslationData(
  data: any,
  mode: "default" | "file" = "file"
): TranslationRuleInput[] {
  if (!data) throw new Error("未提供有效的翻译数据");

  if (mode === "default") {
    const rules: TranslationRuleInput[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== "string") continue;
      const parsed = key.startsWith("/") && key.endsWith("/") ? parseRegexLiteral(key) : key;
      rules.push({ source: parsed instanceof RegExp ? parsed : key, target: value });
    }
    return rules;
  }

  if (isCollDataFormat(data)) return parseCollData(data);
  if (Array.isArray(data)) return parseArray(data);
  if (typeof data === "object") return parseJsonObject(data);
  throw new Error("无法识别的文件格式");
}

/** 任意结构 → aaa/bbb/ccc 规则 */
export function extractAiFixRules(data: any): AiFixRuleInput[] {
  const rules: AiFixRuleInput[] = [];
  if (!data) return rules;

  if (Array.isArray(data)) {
    for (const item of data) {
      if (Array.isArray(item)) {
        if (item.length >= 3 && item[0] && item[2]) {
          rules.push({ aaa: String(item[0]), bbb: String(item[1] ?? ""), ccc: String(item[2]) });
        }
        continue;
      }
      if (item && typeof item === "object") {
        const aaa = item.aaa ?? item.source ?? item.original;
        const bbb = item.bbb ?? item.pattern ?? item.match ?? "";
        const ccc = item.ccc ?? item.target ?? item.replacement ?? item.fix;
        if (aaa && ccc) rules.push({ aaa: String(aaa), bbb: String(bbb ?? ""), ccc: String(ccc) });
      }
    }
    return rules;
  }

  if (typeof data === "object") {
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        if (value.length >= 3) {
          rules.push({ aaa: String(value[0]), bbb: String(value[1] ?? ""), ccc: String(value[2]) });
        } else if (value.length === 2) {
          rules.push({ aaa: key, bbb: String(value[0] ?? ""), ccc: String(value[1]) });
        }
      } else if (typeof value === "string") {
        rules.push({ aaa: key, bbb: "", ccc: value });
      } else if (value && typeof value === "object") {
        const v = value as any;
        const aaa = v.aaa || key;
        const bbb = v.bbb ?? v.pattern ?? "";
        const ccc = v.ccc ?? v.target ?? v.replacement;
        if (aaa && ccc) rules.push({ aaa: String(aaa), bbb: String(bbb), ccc: String(ccc) });
      }
    }
  }
  return rules;
}
