/**
 * text/filters.ts — 「这条文本该不该翻译」的快速判定
 *
 *   1. 可缓存的判定器；
 *   2. LRU memo（默认 512 条），命中即返回；
 *   3. 资源路径检测同样 memo 化（默认 256 条）。
 */

import { Language } from "../../typings/enum";

const RESOURCE_EXT_RE =
  /\.(png|jpe?g|gif|webp|svg|bmp|ico|mp3|wav|ogg|mp4|webm|avi|mov|woff2?|ttf|otf|eot)$/i;
const RESOURCE_DIR_RE =
  /^(img|image|images|audio|video|fonts?|res|resource|assets?|textures?)\//i;
const DATA_URI_RE = /^data:(image|audio|video)\//;
const FTP_URI_RE = /^ftp:\/\//;

const CJK_RE = /[\u4E00-\u9FFF]/;
const KANA_RE = /[\u3040-\u309F\u30A0-\u30FF]/;
const ASCII_RE = /^[\x20-\x7E]+$/;
const LATIN_RE = /[a-zA-Z]/;

export interface SkipDecision {
  skip: boolean;
  reason: "ok" | "resource" | "punctuation" | "control" | "pattern" | "targetLang";
}

export class TextFilter {
  private skipRe: RegExp;
  private punctuationRe: RegExp;
  private lang: Language;
  private skipMemo = new Map<string, SkipDecision>();
  private resourceMemo = new Map<string, boolean>();
  private skipMemoLimit: number;
  private resourceMemoLimit: number;

  constructor(options: {
    skipPatterns: RegExp[];
    punctuationPattern: RegExp;
    targetLang: Language;
    skipMemoLimit?: number;
    resourceMemoLimit?: number;
  }) {
    this.skipMemoLimit = options.skipMemoLimit ?? 512;
    this.resourceMemoLimit = options.resourceMemoLimit ?? 256;
    this.punctuationRe = options.punctuationPattern;
    this.lang = options.targetLang;
    this.skipRe = TextFilter.buildSkipRegExp(options.skipPatterns);
  }

  /**
   * 每条 skip 规则强制整串匹配：
   * 原实现直接拼接 source，像 `Miss|Lv|[HMT]P` 这种无锚定分支会退化成
   * 「包含即命中」，导致任何带 Lv/HP 的句子被整体跳过。
   */
  static buildSkipRegExp(patterns: RegExp[]): RegExp {
    if (!patterns.length) return /(?!)/;
    const ignoreCase = patterns.some((p) => p.flags.includes("i"));
    const source = patterns.map((p) => `(?:^(?:${p.source})$)`).join("|");
    try {
      return new RegExp(source, ignoreCase ? "i" : "");
    } catch {
      return /(?!)/;
    }
  }

  setTargetLang(lang: Language): void {
    if (lang === this.lang) return;
    this.lang = lang;
    this.skipMemo.clear();
  }

  setSkipPatterns(patterns: RegExp[]): void {
    this.skipRe = TextFilter.buildSkipRegExp(patterns);
    this.skipMemo.clear();
  }

  isResourcePath(text: string): boolean {
    if (typeof text !== "string" || text.length === 0) return false;
    const cached = this.resourceMemo.get(text);
    if (cached !== undefined) return cached;
    let result = false;
    if (
      RESOURCE_EXT_RE.test(text) ||
      RESOURCE_DIR_RE.test(text) ||
      DATA_URI_RE.test(text) ||
      FTP_URI_RE.test(text)
    ) {
      result = true;
    }
    if (this.resourceMemo.size >= this.resourceMemoLimit) {
      // 简单 FIFO 淘汰：比 LRU 更省一次 Map 写
      const oldest = this.resourceMemo.keys().next().value;
      if (oldest !== undefined) this.resourceMemo.delete(oldest);
    }
    this.resourceMemo.set(text, result);
    return result;
  }

  isTargetLanguage(text: string): boolean {
    switch (this.lang) {
      case Language.zh_CN:
      case Language.zh_TW:
        return CJK_RE.test(text) && !KANA_RE.test(text);
      case Language.en:
        return ASCII_RE.test(text) && LATIN_RE.test(text);
      case Language.ja:
        return KANA_RE.test(text);
      default:
        return false;
    }
  }

  isPunctuationOnly(text: string): boolean {
    return this.punctuationRe.test(text);
  }

  /** 综合判定（带 memo） */
  evaluate(text: string, isControlOnly: (t: string) => boolean): SkipDecision {
    const cached = this.skipMemo.get(text);
    if (cached) return cached;

    let decision: SkipDecision = { skip: false, reason: "ok" };
    if (this.isResourcePath(text)) decision = { skip: true, reason: "resource" };
    else if (this.isPunctuationOnly(text)) decision = { skip: true, reason: "punctuation" };
    else if (isControlOnly(text)) decision = { skip: true, reason: "control" };
    else if (this.skipRe.test(text)) decision = { skip: true, reason: "pattern" };
    else if (this.isTargetLanguage(text)) decision = { skip: true, reason: "targetLang" };

    if (this.skipMemo.size >= this.skipMemoLimit) {
      const oldest = this.skipMemo.keys().next().value;
      if (oldest !== undefined) this.skipMemo.delete(oldest);
    }
    this.skipMemo.set(text, decision);
    return decision;
  }

  /** 文本有效性（供导入/预翻译等批量场景使用） */
  isValidText(text: unknown): text is string {
    if (typeof text !== "string") return false;
    if (text.length === 0 || text.length > 500) return false;
    if (this.isResourcePath(text)) return false;
    return !/^\s*$/.test(text);
  }

  clearMemo(): void {
    this.skipMemo.clear();
    this.resourceMemo.clear();
  }
}
