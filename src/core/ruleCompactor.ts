type CompactResult = {
  exactMap: Map<string, string>;
  regexRules: Array<{
    pattern: RegExp;
    replacement: string;
  }>;
  stats: {
    originalCount: number;
    compactedCount: number;
    rulesRemoved: number;
    rulesCreated: number;
    compressionRatio: number;
  };
}

type GroupItem = {
  src: string;
  tgt: string;
  srcNums: string[];
  tgtNums: string[];
  structKey: string;
}

export function compactRules(
  exactMap: Map<string, string>,
  threshold: number = 4,
  maxNumRange: number = 99
): CompactResult {
  const originalCount = exactMap.size;
  const newExact = new Map(exactMap);
  const newRegex: Array<{ pattern: RegExp; replacement: string; _meta?: string }> = [];

  const groups = _groupByStructure(exactMap);

  for (const [structKey, items] of groups) {
    if (items.length < threshold) continue;

    const rule = _tryCreateRegexRule(items, structKey, maxNumRange);
    if (!rule) continue;

    // Bug 6 修复：先 test 再 replace，确保 pattern 确实匹配
    let allValid = true;
    for (const item of items) {
      rule.pattern.lastIndex = 0;
      if (!rule.pattern.test(item.src)) {
        allValid = false;
        break;
      }
      rule.pattern.lastIndex = 0;
      const test = item.src.replace(rule.pattern, rule.replacement);
      if (test !== item.tgt) {
        allValid = false;
        break;
      }
    }

    if (!allValid) continue;

    for (const item of items) {
      newExact.delete(item.src);
    }
    newRegex.push({ ...rule });
  }

  const rulesRemoved = originalCount - newExact.size;

  return {
    exactMap: newExact,
    regexRules: newRegex,
    stats: {
      originalCount,
      compactedCount: newExact.size + newRegex.length,
      rulesRemoved,
      rulesCreated: newRegex.length,
      compressionRatio: originalCount > 0
        ? +((1 - (newExact.size + newRegex.length) / originalCount) * 100).toFixed(1)
        : 0,
    },
  };
}

function _groupByStructure(
  exactMap: Map<string, string>
): Map<string, GroupItem[]> {
  const groups = new Map<string, GroupItem[]>();

  for (const [src, tgt] of exactMap) {
    const srcNums = src.match(/\d+/g) || [];
    const tgtNums = tgt.match(/\d+/g) || [];

    if (srcNums.length === 0 || tgtNums.length === 0) continue;
    if (srcNums.length !== tgtNums.length) continue;

    const srcStruct = src.replace(/\d+/g, '§N§');
    const tgtStruct = tgt.replace(/\d+/g, '§N§');
    const structKey = srcStruct + '||' + tgtStruct;

    const item: GroupItem = { src, tgt, srcNums, tgtNums, structKey };
    if (!groups.has(structKey)) groups.set(structKey, []);
    groups.get(structKey)!.push(item);
  }

  return groups;
}

function _tryCreateRegexRule(
  items: GroupItem[],
  structKey: string,
  maxNumRange: number
): { pattern: RegExp; replacement: string } | null {
  const [srcTemplate] = structKey.split('||');

  const allNums = new Set<string>();
  for (const item of items) {
    for (const n of item.srcNums) allNums.add(n);
  }
  const nums = Array.from(allNums).sort((a, b) => +a - +b);

  let numPattern: string;

  if (nums.length <= 2 && +nums[nums.length - 1] - +nums[0] <= maxNumRange) {
    numPattern = `[${nums[0]}-${nums[nums.length - 1]}]`;
  } else if (nums.length <= 10) {
    numPattern = `(${nums.join('|')})`;
  } else {
    const digitCount = nums[nums.length - 1].length;
    numPattern = `(\\d{1,${digitCount}})`;
  }

  let patternSrc = srcTemplate
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\§N\\§/g, '§N§')
    .replace(/§N§/g, numPattern);

  const tgtTemplate = structKey.split('||')[1];
  const replacement = tgtTemplate.replace(/§N§/g, '$1');

  try {
    return { pattern: new RegExp(patternSrc, 'g'), replacement };
  } catch {
    return null;
  }
}

export function preTranslateTexts(
  texts: Iterable<string>,
  exactMap: Map<string, string>,
  regexRules: Array<{
    pattern: RegExp;
    replacement: string
  }>,
  onTranslate?: (original: string, translated: string) => void
): Map<string, string> {
  const result = new Map<string, string>();

  for (const text of texts) {
    if (!text || typeof text !== 'string') continue;
    if (text.length < 2) continue;

    const exact = exactMap.get(text);
    if (exact !== undefined) {
      result.set(text, exact);
      onTranslate?.(text, exact);
      continue;
    }

    let translated = text;
    for (const { pattern, replacement } of regexRules) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        pattern.lastIndex = 0;
        translated = text.replace(pattern, replacement);
        break;
      }
    }

    if (translated !== text) {
      result.set(text, translated);
      onTranslate?.(text, translated);
    }
  }

  return result;
}