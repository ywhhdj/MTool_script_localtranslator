/**
 * rules/rule-compactor.ts — 相似精确规则 → 正则模板
 *
 *   1. 所有数字模式都带捕获组；
 *   2. 使用不可见控制字符 \u0001 作为占位，几乎不可能与游戏文本冲突；
 *   3. 生成的正则统一加 g，并在返回前做「逐条回归校验」，
 *      只要有一条对不上就整组放弃（保持原有安全策略）。
 */

import type { RegexRule } from "../domain/types";

export interface CompactStats {
  originalCount: number;
  compactedCount: number;
  rulesRemoved: number;
  rulesCreated: number;
  compressionRatio: number;
}

export interface CompactResult {
  exactMap: Map<string, string>;
  regexRules: RegexRule[];
  stats: CompactStats;
}

const PLACEHOLDER = "\u0001";
const NUM_RE = /\d+/g;

interface GroupItem {
  src: string;
  tgt: string;
  srcNums: string[];
  structKey: string;
}

export function compactRules(
  exactMap: Map<string, string>,
  threshold: number = 4,
  maxNumRange: number = 99
): CompactResult {
  const originalCount = exactMap.size;
  const newExact = new Map(exactMap);
  const newRegex: RegexRule[] = [];

  const groups = groupByStructure(exactMap);
  let created = 0;

  for (const items of groups.values()) {
    if (items.length < threshold) continue;
    const rule = tryCreateRegexRule(items, maxNumRange);
    if (!rule) continue;

    // 回归校验：任何一条对不上就整组放弃
    let allValid = true;
    for (const item of items) {
      rule.pattern.lastIndex = 0;
      if (!rule.pattern.test(item.src) || item.src.replace(rule.pattern, rule.replacement) !== item.tgt) {
        allValid = false;
        break;
      }
    }
    if (!allValid) continue;

    for (const item of items) newExact.delete(item.src);
    newRegex.push(rule);
    created++;
  }

  const rulesRemoved = originalCount - newExact.size;
  return {
    exactMap: newExact,
    regexRules: newRegex,
    stats: {
      originalCount,
      compactedCount: newExact.size + newRegex.length,
      rulesRemoved,
      rulesCreated: created,
      compressionRatio:
        originalCount > 0
          ? +((1 - (newExact.size + newRegex.length) / originalCount) * 100).toFixed(1)
          : 0,
    },
  };
}

function groupByStructure(exactMap: Map<string, string>): Map<string, GroupItem[]> {
  const groups = new Map<string, GroupItem[]>();
  for (const [src, tgt] of exactMap) {
    const srcNums = src.match(NUM_RE) || [];
    const tgtNums = tgt.match(NUM_RE) || [];
    if (srcNums.length === 0 || tgtNums.length === 0) continue;
    if (srcNums.length !== tgtNums.length) continue;

    const structKey =
      src.replace(NUM_RE, PLACEHOLDER) + "||" + tgt.replace(NUM_RE, PLACEHOLDER);
    const item: GroupItem = { src, tgt, srcNums, structKey };
    const list = groups.get(structKey);
    if (list) list.push(item);
    else groups.set(structKey, [item]);
  }
  return groups;
}

function tryCreateRegexRule(items: GroupItem[], maxNumRange: number): RegexRule | null {
  const structKey = items[0].structKey;
  const [srcTemplate, tgtTemplate] = structKey.split("||");

  const allNums = new Set<string>();
  for (const item of items) for (const n of item.srcNums) allNums.add(n);
  const nums = Array.from(allNums).sort((a, b) => +a - +b);

  // 所有分支都必须是「捕获组」，否则 replacement 的 $1 取不到值
  let numPattern: string;
  if (nums.length <= 2 && +nums[nums.length - 1] - +nums[0] <= maxNumRange) {
    const from = nums[0];
    const to = nums[nums.length - 1];
    numPattern = from === to ? `(${from})` : `([${from}-${to}])`;
  } else if (nums.length <= 10) {
    numPattern = `(${nums.join("|")})`;
  } else {
    const digitCount = nums[nums.length - 1].length;
    numPattern = `(\\d{1,${digitCount}})`;
  }

  const patternSrc = srcTemplate
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .split(PLACEHOLDER)
    .join(numPattern);
  const replacement = tgtTemplate.split(PLACEHOLDER).join("$1");

  try {
    return { pattern: new RegExp(patternSrc, "g"), replacement };
  } catch {
    return null;
  }
}
