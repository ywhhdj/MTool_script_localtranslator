import config from '../config';
import cache from './cache';
import logger, { LogLevel } from './logger';
import { hookRPGMakerPreTranslate, installEngineHooks } from './hookManager';
import aiTranslator from './aiTranslator';
import aiFixRules, { type AIFixRule } from './aiFixRules';
import {
  getCsvFileData,
  getFileType,
  getJSONFileData,
  getPath,
  normalizeTranslationData,
  readFileAsText,
  safeJSONParse,
  stripControlChars,
  isResourcePath,
  parseXLSX,
  parseDelimited,
  getGameName,
  timestampFileName,
  parseCollData,
  isCollDataFormat,
  parseJSON,
  isRegexPattern,
  parseRegex,
} from '../utils';
import { Language } from '../typings/enum';
import { TinyBloom } from './bloomFilter';
import { compactRules } from './ruleCompactor';

class Translator {
  private defaultData: Data.TranslationData = {
    exactMap: new Map(),
    regexRules: [],
    ruleCount: 0,
  };
  private userData: Data.TranslationData = {
    exactMap: new Map(),
    regexRules: [],
    ruleCount: 0,
  };
  private translationData: Data.TranslationData = {
    exactMap: new Map(),
    regexRules: [],
    ruleCount: 0,
  };

  isCustomConfig: boolean = true;
  private ONLY_PUNCTUATION: RegExp = /^[\s%^&*()_+･\-=\[\]{};':"\\|,.<>\/?`~♪!@#$♡。，、；：？！…—～（）｛｝【】《》￥$€£¥¢·・…‥〃〆々〰]+$/;
  private CONTROL_REGEX: RegExp = /\\[A-Za-z](?:\[[^\]]*\])?|\x1b\[[\d;]*[A-Za-z]/g;
  private ALL_CONTROL_CHARS: RegExp = /^\\[A-Za-z](?:\[[^\]]*\])?$|^\x1b\[[\d;]*[A-Za-z]$/;
  private defaultSkipRules: RegExp | null = null;
  private missStreak: number = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private hookTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized: boolean = false;

  /**
   * 正则规则分块快筛表：把每 CHUNK_SIZE 条 pattern 合并成一个大正则。
   * 命中失败的整块可以直接跳过，避免每条文本做上千次 replace。
   * 元素为 null 表示该块无法合并（构造失败），必须逐条执行。
   */
  private regexChunks: Array<RegExp | null> = [];
  private static readonly REGEX_CHUNK_SIZE = 50;

  // 标点归一：预编译为「单字符类 + 查表」，避免每次翻译做 N 次 split/join
  private static readonly PUNCT_RE: RegExp = Translator.buildPunctRegExp();
  private static readonly PUNCT_MAP: Record<string, string> = config.punctuation;
  private static readonly HAS_PUNCT_MAP: boolean =
    !!Translator.PUNCT_MAP && Object.keys(Translator.PUNCT_MAP).length > 0;

  private static buildPunctRegExp(): RegExp {
    const chars = Object.keys(config.punctuation)
      .map(c => c.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&'))
      .join('');
    return chars ? new RegExp(`[${chars}]`, 'g') : /(?!)/g;
  }

  // ===== 优化 =====
  private bloom: TinyBloom = new TinyBloom(2048);
  private preTranslated: boolean = false;
  private preTranslateEnabled: boolean = true;
  private compactStats: any = null;
  private aiLearnedCount: number = 0;

  // ==================== 生命周期 ====================

  public init() {
    if (this.initialized) return;
    this.initialized = true;
    void this._initConfig();
    this._installHooks();
    this._loadStorageCache();
    aiTranslator.updateConfig();
    logger.addLog('MTool 翻译引擎初始化完成（Bloom+预翻译+AI缓存学习已启用）', LogLevel.SUCCESS);
  }

  public destroy() {
    this._saveCacheToStorage();
    this._saveTranslationData();
    cache.clear();
    this.bloom.clear();
    this.translationData = {
      exactMap: new Map(),
      regexRules: [],
      ruleCount: 0
    };
    this.defaultData = {
      exactMap: new Map(),
      regexRules: [],
      ruleCount: 0
    };
    this.userData = {
      exactMap: new Map(),
      regexRules: [],
      ruleCount: 0
    };
    this.initialized = false;
    this.preTranslated = false;
    this.aiLearnedCount = 0;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.hookTimer) clearTimeout(this.hookTimer);
    this.flushTimer = null;
    this.hookTimer = null;
    this.regexChunks = [];
    logger.addLog('MTool 翻译引擎已销毁', LogLevel.INFO);
  }

  // ==================== 配置初始化 ====================

  private async _initConfig() {
    // 每条规则强制「整串匹配」：原写法直接拼接源码后，像 `Miss|Lv|[HMT]P`
    // 这类无锚定分支会退化成「包含即命中」，导致任何带 Lv/HP 的句子都被跳过
    const skipPatterns = config.defaultSkipRules.map((r: RegExp) => `(?:^(?:${r.source})$)`);
    // 保留原规则的 i 标志（合并后 RegExp 不会自动继承各分支的 flags）
    const ignoreCase = config.defaultSkipRules.some((r: RegExp) => r.flags.includes('i'));
    this.defaultSkipRules = new RegExp(skipPatterns.join('|'), ignoreCase ? 'i' : '');

    // 加载默认规则
    const defaultRules = normalizeTranslationData(config.defaultRules, true);
    if (defaultRules && defaultRules.length > 0) {
      this._buildInto(this.defaultData, defaultRules);
      logger.addLog(`默认规则加载完成（${this.defaultData.ruleCount} 条）`, LogLevel.INFO);
    }

    this._mergeToRuntime();
    this._rebuildBloom();
  }

  // ==================== Hook 安装 ====================

  public _installHooks() {
    const self = this;
    if (this.hookTimer) clearTimeout(this.hookTimer);
    this.hookTimer = setTimeout(() => {
      this.hookTimer = null;
      installEngineHooks(
        (text: string) => {
          if (!text || text.length === 0) return text;
          if (typeof text !== 'string') return text;
          if (text.length <= 1) return text;
          return self.interceptText(text);
        },
        config.getEngines(),
        {
          xhrOptions: {
            urlPatterns: [
              "http://127.0.0.1:64002/wslikecmd"
            ],
            method: 'POST',
            transformRequest(body, _) {
              const data = safeJSONParse(body)
              if (data && data.cmd && typeof data.cmd === 'string' && data.cmd === 'trs' && data.args && data.args.length > 0 && typeof data.args[0] === 'string' && data.type && typeof data.type === 'number' && data.type === 1) {
                if (config.debug) {
                  console.log("拦截翻译请求", data);
                }
                self.addCache(data.args[0].trim());
              }
              return body;
            },
            transformResponse(data: API.MootResponse, _) {
              if (data.ret && typeof data.ret === 'string' && data.type && typeof data.type === 'number' && data.type === 1) {
                if (config.debug) {
                  console.log("拦截翻译响应", data);
                }
                data.ret = self.interceptText(data.ret);
              }
              return data;
            },
          }
        }
      );
      if (self.preTranslateEnabled) {
        hookRPGMakerPreTranslate((text) => {
          if (!text || text.length === 0) return text;
          if (typeof text !== 'string') return text;
          return self.interceptText(text);
        });
      }
    }, 1000);
  }

  private static normalizePunctuation(text: string): string {
    if (!text || typeof text !== 'string') return text;
    // 无标点映射时直接返回（这里曾在热路径上每次都 Object.keys 建数组，属于纯浪费）
    if (!Translator.HAS_PUNCT_MAP) return text;
    return text.replace(Translator.PUNCT_RE, ch => Translator.PUNCT_MAP[ch] ?? ch);
  }

  // ==================== 数据构建 ====================

  private _buildInto(target: Data.TranslationData, rules: Data.TranslationRule[]) {
    const exactMap = new Map<string, string>();
    const regexRules: Array<{
      pattern: RegExp;
      replacement: string
    }> = [];

    for (const rule of rules) {
      const source = typeof rule.source === 'string'
        ? Translator.normalizePunctuation(rule.source)
        : rule.source;
      const target = Translator.normalizePunctuation(rule.target);
      if (typeof source === 'string') {
        exactMap.set(source, target);
      } else if (source instanceof RegExp) {
        regexRules.push({ pattern: source, replacement: target });
      }
    }

    regexRules.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
    target.exactMap = exactMap;
    target.regexRules = regexRules;
    target.ruleCount = exactMap.size + regexRules.length;
  }

  private _mergeToRuntime() {
    const mergedExact = new Map<string, string>();
    const mergedRegex: Array<{ pattern: RegExp; replacement: string }> = [];

    for (const [k, v] of this.defaultData.exactMap) mergedExact.set(k, v);
    mergedRegex.push(...this.defaultData.regexRules);

    for (const [k, v] of this.userData.exactMap) mergedExact.set(k, v);
    mergedRegex.push(...this.userData.regexRules);

    mergedRegex.sort((a, b) => b.pattern.source.length - a.pattern.source.length);

    this.translationData = {
      exactMap: mergedExact,
      regexRules: mergedRegex,
      ruleCount: mergedExact.size + mergedRegex.length,
    };
    this._rebuildRegexChunks();
  }

  /**
   * 重建分块快筛正则。仅在规则集变化时执行，不在翻译热路径上。
   */
  private _rebuildRegexChunks(): void {
    const rules = this.translationData.regexRules;
    const size = Translator.REGEX_CHUNK_SIZE;
    const chunks: Array<RegExp | null> = [];
    for (let i = 0; i < rules.length; i += size) {
      const end = Math.min(i + size, rules.length);
      let merged: RegExp | null = null;
      try {
        merged = new RegExp(
          rules.slice(i, end).map(r => `(?:${r.pattern.source})`).join('|')
        );
      } catch {
        merged = null; // 合并失败 → 该块逐条匹配，保证不漏规则
      }
      chunks.push(merged);
    }
    this.regexChunks = chunks;
  }

  private _rebuildBloom() {
    // 按规则量预留容量：规则多时固定 2048 槽位会几乎全命中，前置过滤失效
    this.bloom.reserve(this.translationData.exactMap.size);
    this.bloom.clear();
    for (const key of this.translationData.exactMap.keys()) {
      this.bloom.add(key);
    }
  }

  // ==================== 核心翻译流程 ====================

  public interceptText(text: string): string {
    if (!text || typeof text !== 'string') return text;
    if (text.length === 0) return text;
    if (typeof text !== 'string') return text;

    const rawText = text.trim();
    let text_ = stripControlChars(rawText);

    if (
      !text_ ||
      text_.length < 2 ||
      text_.length > 500 ||
      this.isSkip(text_)   // 跳过检查
    ) {
      return text;
    }
    text_ = Translator.normalizePunctuation(text_);

    // 控制符分段翻译（带缓存，否则每次都要重新分段 + 全量正则匹配）
    // 注意：查询键必须与 addCache 写入键一致（都用归一化后的文本），
    // 否则含全角数字的文本会永远查不中，退化成每次重算
    this.CONTROL_REGEX.lastIndex = 0;
    if (this.CONTROL_REGEX.test(rawText)) {
      this.CONTROL_REGEX.lastIndex = 0;
      const ctlKey = Translator.normalizePunctuation(rawText);
      const cachedCtl = cache.get(ctlKey);
      if (cachedCtl !== undefined) return cachedCtl;
      const out = this.translateWithControls(rawText);
      if (out !== rawText) this.addCache(rawText, out);
      return out;
    }

    // 3. 缓存查询
    const cached = cache.get(text_);
    if (cached !== undefined) {
      return cached;
    }

    // 4. 规则翻译
    const result = this.doFix(text_);

    if (result !== text_) {
      this.addCache(text_, result);
      return result;
    }
    if (config.debug) {
      console.log("未翻译文本", text_.length > 50 ? text_.slice(0, 50) + "..." : text_);
    }

    // 5. 未命中 → 忽略 + 触发 AI
    cache.addIgnore(text_);
    this.missStreak++;
    if (aiTranslator.isAvailable) {
      const threshold = config.user.aiTriggerThreshold.userConfig ?? 5;
      if (this.missStreak >= threshold) {
        this._scheduleAIBatch();
      }
    }
    return text;
  }

  /**
   * 写入一条已知译文。
   * 单参调用（只有原文、译文待定）时绝不写空值进缓存：
   * 否则命中缓存会把原文替换成空串，游戏里直接丢字。
   */
  public addCache(text: string, result: string = ""): void {
    if (!text || typeof text !== 'string') return;
    text = text.trim();
    if (!text) return;

    const normalized = Translator.normalizePunctuation(text);
    this.bloom.add(normalized);

    const value = (result || '').trim();
    if (value && value !== text) {
      cache.set(normalized, value, true);
      this.missStreak = 0;
    }
  }

  private translateWithControls(text: string): string {
    const parts: string[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    this.CONTROL_REGEX.lastIndex = 0;

    while ((match = this.CONTROL_REGEX.exec(text)) !== null) {
      // 控制符前面的纯文本段
      const before = text.slice(lastIndex, match.index);
      if (before) {
        parts.push(this.doFix(before));
      }
      // 控制符本身
      parts.push(match[0]);
      lastIndex = match.index + match[0].length;
      // 防御：零长匹配会让 while 死循环
      if (match[0].length === 0) this.CONTROL_REGEX.lastIndex++;
    }

    // 剩余纯文本段
    const after = text.slice(lastIndex);
    if (after) {
      parts.push(this.doFix(after));
    }

    this.CONTROL_REGEX.lastIndex = 0;
    return parts.join('');
  }

  /**
   * 查找匹配的规则
   */
  private doFix(text: string): string {
    if (!text || typeof text !== 'string') return text;
    if (cache.isIgnored(text)) return text;
    if (isResourcePath(text)) return text;

    // Bloom 前置过滤：mightContain=false 表示一定不在精确表中，可直接跳过 Map 查询
    if (this.bloom.mightContain(text)) {
      const exact = this.translationData.exactMap.get(text);
      if (exact !== undefined) return exact;
    }

    let result = text;
    let replaceCount = 0;
    const maxReplace = config.user.maxReplaceCount.userConfig ?? 1;
    const rules = this.translationData.regexRules;
    const chunks = this.regexChunks;
    const chunkSize = Translator.REGEX_CHUNK_SIZE;

    // 用户正则：按块先做一次合并 test，整块不命中就跳过，避免每条文本做上千次 replace
    for (let c = 0; c < chunks.length && replaceCount < maxReplace; c++) {
      const start = c * chunkSize;
      const end = Math.min(start + chunkSize, rules.length);
      const merged = chunks[c];
      if (merged && !merged.test(result)) continue;

      for (let i = start; i < end; i++) {
        const { pattern, replacement } = rules[i];
        pattern.lastIndex = 0;
        const next = result.replace(pattern, replacement);
        if (next !== result) {
          result = next;
          replaceCount++;
          if (replaceCount >= maxReplace) break;
        }
      }
    }
    return result;
  }

  // ==================== 跳过判断 ====================

  private isSkip(text: string): boolean {
    if (this.ALL_CONTROL_CHARS.test(text)) return true;
    if (this.ONLY_PUNCTUATION.test(text)) return true;
    if (this.defaultSkipRules?.test(text)) return true;
    return this.isTargetLanguage(text);
  }

  isTargetLanguage(text: string): boolean {
    const lang = config.user.targetLang.userConfig;
    switch (lang) {
      case Language.zh_CN:
      case Language.zh_TW:
        //匹配若是全是中文但不包含日文假名，才跳过
        return /[\u4E00-\u9FFF]/.test(text) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(text);
      case Language.en:
        return /^[\x20-\x7E]+$/.test(text) && /[a-zA-Z]/.test(text);
      case Language.ja:
        return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
      default:
        return false;
    }
  }

  // ==================== AI 翻译学习 ====================

  fixAITranslation(original: string, aiResult: string): string {
    if (original === null || original === undefined) return aiResult || '';
    if (aiResult === null || aiResult === undefined) return original || '';
    if (typeof original !== 'string') {
      try { original = String(original); } catch { return aiResult; }
    }
    if (typeof aiResult !== 'string') {
      try { aiResult = String(aiResult); } catch { return original; }
    }
    if (original === aiResult) return aiResult;

    // Step1: aiFixRules 后修正
    const fixed = aiFixRules.fix(original, aiResult);

    // Step2: 如果有修正结果，写入学习
    if (fixed && fixed !== original) {
      this._learnTranslation(original, fixed);
      return fixed;
    }

    // Step3: aiFix 没修改，但 AI 译文有效 → 也学习
    if (aiResult && aiResult !== original) {
      this._learnTranslation(original, aiResult);
      return aiResult;
    }

    return aiResult || original;
  }

  processAIResponse(original: string, aiResult: string): string {
    return this.fixAITranslation(original, aiResult);
  }

  private _learnTranslation(original: string, translated: string): void {
    if (!original || !translated) return;
    if (original === translated) return;
    if (typeof original !== 'string' || typeof translated !== 'string') return;

    const existing = cache.get(original);
    if (existing === undefined) {
      cache.set(original, translated, true);
    }

    // bloom 里存的是归一化后的 key（与 _buildInto 保持一致），否则会假阴性漏掉精确规则
    const bloomKey = Translator.normalizePunctuation(original);
    this.bloom.add(bloomKey);
    this.missStreak = 0;

    if (!this.userData.exactMap.has(original)) {
      this.userData.exactMap.set(original, translated);
      this.userData.ruleCount = this.userData.exactMap.size + this.userData.regexRules.length;
      this.translationData.exactMap.set(original, translated);
      this.translationData.ruleCount =
        this.translationData.exactMap.size + this.translationData.regexRules.length;
      this.aiLearnedCount++;
      if (this.aiLearnedCount % 10 === 0) {
        logger.addLog(`[AI学习] 已积累 ${this.aiLearnedCount} 条`, LogLevel.DEBUG);
      }
    }
  }

  // ==================== AI Fix 规则管理（委托）====================

  hasAIFixRule(original: string): boolean {
    return aiFixRules.shouldIntercept(original);
  }

  async loadAIFixRules(file: File): Promise<boolean> {
    return aiFixRules.loadFromFile(file);
  }

  addAIFixRule(aaa: string | RegExp, bbb: string | RegExp, ccc: string): void {
    // 形如 "/\d+日目/" 的字符串也必须识别为正则，
    // 否则会被当成普通字符串做全等比较而永远匹配不上
    const parsedAaa = typeof aaa === 'string' ? parseRegex(aaa) : aaa;
    const parsedBbb = typeof bbb === 'string' ? parseRegex(bbb) : bbb;
    aiFixRules.addRule({
      aaa: parsedAaa,
      bbb: parsedBbb,
      ccc,
      _isRegex: isRegexPattern(parsedAaa) || isRegexPattern(parsedBbb),
    });
  }

  removeAIFixRule(index: number): boolean {
    return aiFixRules.removeRule(index);
  }

  get aiFixRules() {
    return aiFixRules.getRules();
  }

  clearAIFixRules(): void {
    aiFixRules.clear();
  }

  exportAIFixRules(format: 'json' | 'csv' = 'json') {
    if (format === 'csv') return aiFixRules.exportCSV();
    return aiFixRules.exportJSON();
  }

  // ==================== 🆕 统一文件上传入口 ====================

  /**
   * 自动识别文件格式并分发到正确的处理器
   *
   * 判断逻辑：
   *  1. 三列数据 (aaa, bbb, ccc) → AI Fix 规则
   *  2. 两列数据 (source, target) → 翻译规则
   *  3. CollData.json 格式（含 data[].data 嵌套数组）→ 翻译规则
   *  4. { "原文": "译文" } 对象格式 → 翻译规则
   */
  async loadUniversalFile(file: File): Promise<{
    type: 'translation' | 'aiFix' | 'mixed';
    translationCount: number;
    aiFixCount: number;
  }> {
    const ext = getFileType(file.name);
    let rawData: any;
    // ---- 读取文件 ----
    if (ext === 'json') {
      const text = await readFileAsText(file);
      rawData = safeJSONParse(text);
      if (!rawData) throw new Error('JSON 解析失败');
    } else if (ext === 'csv' || ext === 'tsv') {
      rawData = await readFileAsText(file);
      const delimiter = ext === 'csv' ? ',' : '\t';
      rawData = parseDelimited(rawData, delimiter);
    } else if (ext === 'xlsx' || ext === 'xls') {
      rawData = await parseXLSX(file);
    } else {
      throw new Error(`不支持的文件格式: .${ext}`);
    }
    if (config.debug) {
      console.log(`[MToolTranslatorPlugin][Upload] 文件: ${file.name} (${ext})`, rawData);
    }
    // ---- 判断格式并分发 ----
    return this._dispatchFileData(rawData, file.name, ext);
  }

  private _dispatchFileData(rawData: any, fileName: string, ext: string): {
    type: 'translation' | 'aiFix' | 'mixed';
    translationCount: number;
    aiFixCount: number;
  } {
    // === CollData.json 格式检测 ===
    if (ext == "json" && isCollDataFormat(rawData)) {
      console.log(`[MToolTranslatorPlugin][Upload] 检测到 CollData.json 格式`);
      const rules = parseCollData(rawData);
      this._buildInto(this.userData, rules);
      this._mergeToRuntime();
      this._rebuildBloom();
      logger.addLog(`CollData 加载成功: ${fileName}（${rules.length} 条翻译规则）`, LogLevel.SUCCESS);
      return {
        type: 'translation',
        translationCount: rules.length,
        aiFixCount: 0
      };
    }

    // === 数组格式：判断两列 vs 三列 ===
    if ((ext == "csv" || ext == "tsv") && Array.isArray(rawData)) {
      return this._classifyAndLoad(rawData, fileName);
    }

    // === 对象格式 { "原文": "译文" } ===
    if (ext == "json" && typeof rawData === 'object' && rawData !== null) {
      const rules = parseJSON(rawData);
      if (rules.length > 0) {
        this._buildInto(this.userData, rules);
        this._mergeToRuntime();
        this._rebuildBloom();
        logger.addLog(`翻译文件加载成功: ${fileName}（${rules.length} 条）`, LogLevel.SUCCESS);
        return { type: 'translation', translationCount: rules.length, aiFixCount: 0 };
      }
    }

    throw new Error(`无法识别的文件格式: ${fileName}`);
  }

  /**
   * 核心分发逻辑：分析数组数据，自动分流到翻译规则或 AI Fix 规则
   */
  private _classifyAndLoad(rows: any[][], fileName: string): {
    type: 'translation' | 'aiFix' | 'mixed';
    translationCount: number;
    aiFixCount: number;
  } {
    // 过滤有效行
    const validRows = rows.filter(r =>
      Array.isArray(r) && r.length >= 2 && r[0] && String(r[0]).trim()
    );

    if (validRows.length === 0) {
      throw new Error('文件中没有有效数据行');
    }

    // 抽样检测：前 20 行中，有多少是"三列格式"
    const sampleSize = Math.min(20, validRows.length);
    let threeColumnCount = 0;
    let twoColumnCount = 0;

    for (let i = 0; i < sampleSize; i++) {
      const row = validRows[i];
      if (row.length >= 3 && row[2] && String(row[2]).trim()) {
        // 第三列有内容 → 可能是 aaa/bbb/ccc
        threeColumnCount++;
      } else if (row.length >= 2 && row[1] && String(row[1]).trim()) {
        twoColumnCount++;
      }
    }
    if (config.debug) {
      console.log(`[MToolTranslatorPlugin][Upload] 采样 ${sampleSize} 行: 三列=${threeColumnCount}, 两列=${twoColumnCount}`);
    }

    // 判断结果
    const isAIFix = threeColumnCount > sampleSize * 0.6; // >60% 三列 → AI Fix
    const isMixed = threeColumnCount > 0 && twoColumnCount > 0 && !isAIFix;

    let translationCount = 0;
    let aiFixCount = 0;

    if (isAIFix) {
      // 全部作为 AI Fix 规则
      const aiRules: AIFixRule[] = [];
      for (const row of validRows) {
        if (row.length >= 3 && row[2]) {
          const aaa = String(row[0]).trim();
          const bbb = row[1] ? String(row[1]).trim() : '';
          const ccc = String(row[2]).trim();
          if (aaa && ccc) {
            aiRules.push({ aaa, bbb, ccc, _isRegex: false });
          }
        }
      }
      aiFixRules.clear();
      aiFixRules.addRules(aiRules);
      aiFixCount = aiRules.length;
      logger.addLog(`AI Fix 规则加载成功: ${fileName}（${aiFixCount} 条）`, LogLevel.SUCCESS);

    } else if (isMixed) {
      // 混合：三列的走 AI Fix，两列的走翻译规则
      const transRules: Data.TranslationRule[] = [];
      const aiRules: AIFixRule[] = [];

      for (const row of validRows) {
        if (row.length >= 3 && row[2] && String(row[2]).trim()) {
          const aaa = String(row[0]).trim();
          const bbb = row[1] ? String(row[1]).trim() : '';
          const ccc = String(row[2]).trim();
          if (aaa && ccc) aiRules.push({ aaa, bbb, ccc, _isRegex: false });
        } else if (row.length >= 2 && row[1]) {
          transRules.push({
            source: String(row[0]).trim(),
            target: String(row[1]).trim()
          });
        }
      }

      if (transRules.length > 0) {
        this._buildInto(this.userData, transRules);
        this._mergeToRuntime();
        this._rebuildBloom();
      }
      if (aiRules.length > 0) {
        aiFixRules.clear();
        aiFixRules.addRules(aiRules);
      }

      translationCount = transRules.length;
      aiFixCount = aiRules.length;
      logger.addLog(
        `混合规则加载成功: ${fileName}（翻译 ${translationCount} + AI Fix ${aiFixCount}）`,
        LogLevel.SUCCESS
      );

    } else {
      // 全部作为翻译规则
      const transRules: Data.TranslationRule[] = [];
      for (const row of validRows) {
        if (row.length >= 2 && row[1]) {
          transRules.push({ source: String(row[0]).trim(), target: String(row[1]).trim() });
        }
      }
      this._buildInto(this.userData, transRules);
      this._mergeToRuntime();
      this._rebuildBloom();
      translationCount = transRules.length;
      logger.addLog(`翻译文件加载成功: ${fileName}（${translationCount} 条）`, LogLevel.SUCCESS);
    }

    return {
      type: isAIFix ? 'aiFix' : (isMixed ? 'mixed' : 'translation'),
      translationCount,
      aiFixCount,
    };
  }

  // ==================== 文件加载（兼容旧接口）====================

  async loadTranslationData(fileName: string) {
    if (!fileName) return;
    try {
      const storageKey = `cache_${fileName}`;
      const saved = localStorage.getItem(storageKey);
      if (saved && config.user.autoLoad.userConfig) {
        const parsed = safeJSONParse<any>(saved);
        if (parsed) {
          const rules = normalizeTranslationData(parsed);
          if (rules) {
            this._buildInto(this.userData, rules);
            this._mergeToRuntime();
            this._rebuildBloom();
            logger.addLog(`从缓存恢复翻译数据: ${fileName}`, LogLevel.SUCCESS);
            return;
          }
        }
      }
      const path = await getPath(fileName);
      const type = getFileType(path);
      let rawData: any;
      if (type === 'json') {
        rawData = await getJSONFileData(path);
      } else if (type === 'csv' || type === 'tsv') {
        rawData = await getCsvFileData(path);
      } else {
        logger.addLog(`不支持的文件类型: ${type}`, LogLevel.ERROR);
        return;
      }
      const rules = normalizeTranslationData(rawData);
      if (!rules) return;
      this._buildInto(this.userData, rules);
      this._mergeToRuntime();
      this._rebuildBloom();
      logger.addLog(`翻译文件加载成功: ${fileName}（${rules.length} 条规则）`, LogLevel.SUCCESS);
    } catch (e: any) {
      logger.addLog(`加载翻译文件失败 [${fileName}]: ${e.message}`, LogLevel.ERROR);
    }
  }

  async loadFromFile(file: File): Promise<boolean> {
    try {
      const result = await this.loadUniversalFile(file);
      return result.translationCount > 0 || result.aiFixCount > 0;
    } catch (e: any) {
      logger.addLog(`文件加载失败 [${file.name}]: ${e.message}`, LogLevel.ERROR);
      return false;
    }
  }

  // ==================== 规则压缩 ====================

  compactRules(threshold: number = 4): any {
    const { exactMap, regexRules, stats } = compactRules(
      this.userData.exactMap,
      threshold
    );
    const mergedRegex = [...regexRules, ...this.userData.regexRules];
    mergedRegex.sort((a, b) => b.pattern.source.length - a.pattern.source.length);

    this.userData = {
      exactMap,
      regexRules: mergedRegex,
      ruleCount: exactMap.size + mergedRegex.length,
    };

    this._mergeToRuntime();
    this._rebuildBloom();
    this.compactStats = stats;

    logger.addLog(
      `规则压缩完成: ${stats.originalCount} → ${stats.compactedCount} 条 ` +
      `（移除 ${stats.rulesRemoved} 条，生成 ${stats.rulesCreated} 条正则，压缩率 ${stats.compressionRatio}%）`,
      LogLevel.SUCCESS
    );
    return stats;
  }

  // ==================== 预翻译 ====================

  preTranslate(texts: Iterable<string>): Map<string, string> {
    const result = new Map<string, string>();
    // 走 doFix 而非逐条全量正则：复用 Bloom 前置过滤 + 分块快筛，
    // 上万条文本时差别是数量级的
    for (const text of texts) {
      if (!text || typeof text !== 'string' || text.length < 2) continue;
      if (this.isSkip(text)) continue;

      const translated = this.doFix(text);
      if (translated === text) continue;

      result.set(text, translated);
      cache.set(text, translated);
      // bloom 里存归一化后的键，与 doFix 的查询路径保持一致
      this.bloom.add(Translator.normalizePunctuation(text));
      if (!this.userData.exactMap.has(text)) {
        this.userData.exactMap.set(text, translated);
      }
    }
    this.userData.ruleCount = this.userData.exactMap.size + this.userData.regexRules.length;
    this.preTranslated = true;
    this._mergeToRuntime();
    logger.addLog(`预翻译完成: ${result.size} 条文本已翻译并预热到缓存`, LogLevel.SUCCESS);
    return result;
  }

  get isPreTranslated(): boolean {
    return this.preTranslated;
  }
  setPreTranslateEnabled(enabled: boolean) {
    this.preTranslateEnabled = enabled;
  }

  // ==================== AI 批量翻译 ====================

  private _scheduleAIBatch() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this._flushAIBatch();
    }, 3000);
  }

  private async _flushAIBatch() {
    // 只取最近未命中的文本，避免每次把整个忽略集合（可能上万条）转成数组
    const texts = cache.getRecentIgnored(20);
    if (texts.length === 0) return;
    try {
      const results = await aiTranslator.translateBatch(texts);
      let newCount = 0;
      for (const [original, translated] of results) {
        if (translated && translated !== original) {
          if (!this.userData.exactMap.has(original)) {
            this.userData.exactMap.set(original, translated);
            cache.set(original, translated);
            this.bloom.add(original);
            cache.removeIgnore(original);
            newCount++;
          }
        }
      }
      if (newCount > 0) {
        this.userData.ruleCount = this.userData.exactMap.size + this.userData.regexRules.length;
        this.translationData.ruleCount =
          this.translationData.exactMap.size + this.translationData.regexRules.length;
        this.aiLearnedCount += newCount;
        logger.addLog(`AI 翻译新增 ${newCount} 条规则`, LogLevel.SUCCESS);
      }
    } catch (e: any) {
      logger.addLog(`AI 批量翻译失败: ${e.message}`, LogLevel.ERROR);
    }
  }

  private cacheStorageKey = 'LocalTranslatorGameCache';

  // ==================== 持久化 ====================

  private _saveCacheToStorage(immediate: boolean = false) {
    if (immediate) cache.saveToStorageNow(this.cacheStorageKey);
    else cache.saveToStorage(this.cacheStorageKey);
  }

  private _loadStorageCache() { cache.loadFromStorage(this.cacheStorageKey); }

  /** 仅清理本插件自己写入的键，绝不触碰宿主页面/游戏的其它 localStorage 数据 */
  private _clearOwnStorage() {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        // 只清翻译数据键；主缓存键（LocalTranslatorGameCache）由调用方单独管理
        if (k && k.startsWith('cache_')) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.warn('[Translator] 清理旧缓存失败:', e);
    }
  }

  /** 保存用户翻译数据（对外公开，供 UI 主动触发） */
  public saveUserData(): void {
    this._saveTranslationData();
  }

  private _saveTranslationData() {
    if (!config.user.autoLoad.userConfig) return;
    const data = {
      exactMap: Array.from(this.userData.exactMap.entries()),
      regexRules: this.userData.regexRules.map(r => ({
        pattern: r.pattern.source,
        flags: r.pattern.flags,
        replacement: r.replacement,
      })),
    };
    try {
      // 注意：这里曾经调用 localStorage.clear()，会连带清空游戏存档与插件配置
      this._clearOwnStorage();
      localStorage.setItem(`cache_${config.user.fileName.userConfig}`, JSON.stringify(data));
    } catch (e) {
      console.warn('[Translator] 保存翻译数据失败:', e);
    }
  }

  // ==================== 统计与导出 ====================

  get stats() {
    const cacheStats = cache.hitRate;
    const aiFixStats = aiFixRules.getStats();
    return {
      rules: this.translationData.ruleCount,
      exactRules: this.translationData.exactMap.size,
      regexRules: this.translationData.regexRules.length,
      defaultRules: this.defaultData.ruleCount,
      userRules: this.userData.ruleCount,
      aiLearnedCount: this.aiLearnedCount,
      cacheSize: cache.size,
      ignoreSize: cache.ignoreSize,
      cacheHitRate: cacheStats.hitRate,
      cacheTotal: cacheStats.total,
      aiPendingCount: aiTranslator.pendingCount,
      bloomSize: this.bloom.count,
      bloomBytes: this.bloom.byteSize,
      preTranslated: this.preTranslated,
      compactStats: this.compactStats,
      aiFixRules: aiFixStats.total,
      aiFixHits: aiFixStats.hits,
      aiFixLastFix: aiFixStats.lastFix,
    };
  }

  exportTranslationData(format: "json" | "csv" = "json"): {
    data: any;
    fileName: string
  } {

    const allExact = new Map<string, string>();
    for (const [k, v] of cache.exportEntries()) {
      if (!allExact.has(k)) allExact.set(k, v);
    }

    if (format === "json") {
      const obj: Record<string, string> = {};
      for (const [k, v] of allExact) obj[k] = v;
      return {
        data: obj,
        fileName: timestampFileName(`Translation_${getGameName()}`, "json")
      };
    }

    if (format === "csv") {
      const rows = [['source', 'target']];
      for (const [k, v] of allExact) rows.push([k, v]);
      return {
        data: rows,
        fileName: timestampFileName(`Translation_${getGameName()}`, "csv")
      };
    }

    const rows = [['source', 'target']];
    for (const [k, v] of allExact) rows.push([k, v]);
    return {
      data: rows,
      fileName: timestampFileName(`Translation_${getGameName()}`, "tsv")
    };
  }

  reset() {
    this.userData = { exactMap: new Map(), regexRules: [], ruleCount: 0 };
    this._mergeToRuntime();
    cache.clear();
    this.bloom.clear();
    for (const key of this.translationData.exactMap.keys()) {
      this.bloom.add(key);
    }
    aiFixRules.clear();
    this.preTranslated = false;
    this.compactStats = null;
    this.aiLearnedCount = 0;
    this.missStreak = 0;
    logger.addLog('所有用户翻译数据已重置（默认规则保留）', LogLevel.WARNING);
  }
}

const translator = new Translator();
export default translator;
