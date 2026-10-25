/**
 * domain/types.ts — 领域模型（最内层，零依赖）
 *
 * 规则：本文件只允许出现纯类型与常量，不得 import 任何模块，
 * 从而保证「领域层不反向依赖任何外层」。
 */

/** 一条精确/正则翻译规则的输入形态 */
export interface TranslationRuleInput {
  source: string | RegExp;
  target: string;
}

/** 编译后的正则规则 */
export interface RegexRule {
  pattern: RegExp;
  replacement: string;
}

/** 一组规则（精确表 + 正则表） */
export interface RuleSet {
  exact: Map<string, string>;
  regex: RegexRule[];
}

/** aaa / bbb / ccc 后修正规则（内部编译态） */
export interface AiFixRule {
  aaa: string | RegExp;
  bbb: string | RegExp | "";
  ccc: string;
  /** aaa 或 bbb 任一为正则 */
  isRegex: boolean;
}

export type AiFixRuleInput = {
  aaa: string | RegExp;
  bbb?: string | RegExp | null;
  ccc: string;
};

/** 文本来源，用于统计与调试定位 */
export type TranslateSource =
  | "engine"
  | "network"
  | "websocket"
  | "moot"
  | "manual";

export interface TranslateOptions {
  source?: TranslateSource;
  /** 跳过缓存（强制重算） */
  bypassCache?: boolean;
}

export interface TranslateResult {
  text: string;
  /** 0=未命中 1=缓存 2=精确规则 3=正则规则 */
  hit: 0 | 1 | 2 | 3;
}

export interface TranslatorStats {
  rules: number;
  exactRules: number;
  regexRules: number;
  defaultRules: number;
  userRules: number;
  learnedRules: number;
  aiLearnedCount: number;
  cacheSize: number;
  ignoreSize: number;
  cacheHitRate: number;
  cacheTotal: number;
  bloomInsertions: number;
  bloomBytes: number;
  bloomFillRatio: number;
  preTranslated: boolean;
  compactStats: unknown | null;
  aiFixRules: number;
  aiFixHits: number;
  aiFixLastFix: string;
}

/** 文件导入结果 */
export interface ImportResult {
  type: "translation" | "aiFix" | "mixed";
  translationCount: number;
  aiFixCount: number;
}

export type ExportFormat = "json" | "csv" | "tsv";

export interface ExportPayload {
  data: unknown;
  fileName: string;
  format: ExportFormat;
}

export const HIT_NONE = 0;
export const HIT_CACHE = 1;
export const HIT_EXACT = 2;
export const HIT_REGEX = 3;
