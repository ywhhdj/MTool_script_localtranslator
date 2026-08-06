/**
 * RuleCompactor — 规则压缩器
 * 
 * 核心功能：
 *   扫描精确翻译规则集，自动识别"结构相同仅数字不同"的规则，
 *   将其聚合为一条正则模板规则，大幅减少规则数量和内存占用。
 *
 * 示例：
 *   "1日目" → "第1天"
 *   "2日目" → "第2天"
 *   ...
 *   "9日目" → "第9天"
 *   ↓ 聚合为 1 条正则：
 *   /([1-9])日目/g → "第$1天"
 *
 * 支持的模式类型：
 *   1. 数字变化:  "1日目"~"9日目", "船Lv1"~"船Lv20"
 *   2. 字符变化:  "ミュー春"~"ミュー冬"（需配合正则实现）
 *   3. 混合变化:  复杂数字模式
 */

export interface CompactResult {
  exactMap: Map<string, string>;
  regexRules: Array<{ pattern: RegExp; replacement: string; _meta?: string }>;
  stats: {
    originalCount: number;
    compactedCount: number;
    rulesRemoved: number;
    rulesCreated: number;
    compressionRatio: number;
  };
}

interface GroupItem {
  src: string;
  tgt: string;
  srcNums: string[];
  tgtNums: string[];
  structKey: string;
}

/**
 * 主入口：压缩精确规则
 * @param exactMap 原始精确规则 Map
 * @param threshold 聚合阈值（至少 N 条相似才聚合，默认 4）
 * @param maxNumRange 数字范围上限（超过此范围用 \d+ 代替）
 */
export function compactRules(
  exactMap: Map<string, string>,
  threshold: number = 4,
  maxNumRange: number = 99
): CompactResult {
  const originalCount = exactMap.size;
  const newExact = new Map(exactMap);
  const newRegex: Array<{ pattern: RegExp; replacement: string; _meta?: string }> = [];

  // ===== 第1步：按结构分组 =====
  const groups = _groupByStructure(exactMap);

  // ===== 第2步：对每个组尝试生成正则 =====
  for (const [structKey, items] of groups) {
    if (items.length < threshold) continue;

    const rule = _tryCreateRegexRule(items, structKey, maxNumRange);
    if (!rule) continue;

    // 验证正则规则的正确性
    let allValid = true;
    for (const item of items) {
      const test = item.src.replace(rule.pattern, rule.replacement);
      if (test !== item.tgt) {
        allValid = false;
        break;
      }
    }

    if (!allValid) continue;

    // 验证通过 → 从精确 Map 中移除，加入正则规则
    for (const item of items) {
      newExact.delete(item.src);
    }
    newRegex.push({
      ...rule,
      _meta: `compacted from ${items.length} rules`,
    });
  }

  const rulesRemoved = originalCount - newExact.size;
  const rulesCreated = newRegex.length;

  return {
    exactMap: newExact,
    regexRules: newRegex,
    stats: {
      originalCount,
      compactedCount: newExact.size + newRegex.length,
      rulesRemoved,
      rulesCreated,
      compressionRatio: originalCount > 0
        ? +((1 - (newExact.size + newRegex.length) / originalCount) * 100).toFixed(1)
        : 0,
    },
  };
}

// ==================== 内部实现 ====================

/**
 * 按结构分组：把数字部分替换为占位符后做 key
 * 
 * 特殊处理：对于字符变化（如 ミュー/アル），也尝试提取公共前缀
 */
function _groupByStructure(
  exactMap: Map<string, string>
): Map<string, GroupItem[]> {
  const groups = new Map<string, GroupItem[]>();

  for (const [src, tgt] of exactMap) {
    const srcNums = src.match(/\d+/g) || [];
    const tgtNums = tgt.match(/\d+/g) || [];

    // 必须双方都有数字才能聚合
    if (srcNums.length === 0 || tgtNums.length === 0) continue;
    if (srcNums.length !== tgtNums.length) continue;

    // 构建结构 key
    const srcStruct = src.replace(/\d+/g, '§N§');
    const tgtStruct = tgt.replace(/\d+/g, '§N§');
    const structKey = srcStruct + '||' + tgtStruct;

    const item: GroupItem = { src, tgt, srcNums, tgtNums, structKey };
    if (!groups.has(structKey)) groups.set(structKey, []);
    groups.get(structKey)!.push(item);
  }

  return groups;
}

/**
 * 尝试为一组相似规则创建正则
 * 
 * 数字模式选择策略：
 *   - 2个以内连续数字 → [1-9] 字符类
 *   - 10个以内离散数字 → (1|2|3|...)
 *   - 更多数字 → \d{1,N} 通配
 */
function _tryCreateRegexRule(
  items: GroupItem[],
  structKey: string,
  maxNumRange: number
): { pattern: RegExp; replacement: string } | null {
  const [srcTemplate] = structKey.split('||');

  // 提取所有数字值
  const allNums = new Set<string>();
  for (const item of items) {
    for (const n of item.srcNums) allNums.add(n);
  }
  const nums = Array.from(allNums).sort((a, b) => +a - +b);

  // 判断数字模式
  let numPattern: string;

  if (nums.length <= 2 && +nums[nums.length - 1] - +nums[0] <= maxNumRange) {
    // 少量连续数字 → [min-max]
    numPattern = `[${nums[0]}-${nums[nums.length - 1]}]`;
  } else if (nums.length <= 10) {
    // 少量离散数字 → 多选
    numPattern = `(${nums.join('|')})`;
  } else {
    // 大量数字 → \d+ 并限制位数
    const digitCount = nums[nums.length - 1].length;
    numPattern = `(\\d{1,${digitCount}})`;
  }

  // 构建完整正则源
  // 先把 §N§ 替换为占位，再转义特殊字符，最后替换为数字模式
  let patternSrc = srcTemplate
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // 转义正则特殊字符
    .replace(/\\§N\\§/g, '§N§')                // 还原被误转义的占位符
    .replace(/§N§/g, numPattern);                // 替换为数字捕获组

  // 构建替换模板
  // 从 structKey 中提取目标模板
  const tgtTemplate = structKey.split('||')[1];
  let replacement = tgtTemplate.replace(/§N§/g, '$1');

  try {
    const pattern = new RegExp(patternSrc, 'g');
    return { pattern, replacement };
  } catch {
    return null;
  }
}

/**
 * 对文本集合执行批量预翻译
 * 
 * 这是"预翻译"的核心：在游戏数据加载阶段就完成所有已知文本的翻译，
 * 运行时直接命中缓存，零正则开销。
 */
export function preTranslateTexts(
  texts: Iterable<string>,
  exactMap: Map<string, string>,
  regexRules: Array<{ pattern: RegExp; replacement: string }>,
  onTranslate?: (original: string, translated: string) => void
): Map<string, string> {
  const result = new Map<string, string>();

  for (const text of texts) {
    if (!text || typeof text !== 'string') continue;
    if (text.length < 2) continue;

    // 1. 精确匹配 O(1)
    const exact = exactMap.get(text);
    if (exact !== undefined) {
      result.set(text, exact);
      onTranslate?.(text, exact);
      continue;
    }

    // 2. 正则匹配
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
