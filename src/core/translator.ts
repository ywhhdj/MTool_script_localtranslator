import config from '../config';
import cache from './cache';
import logger, { LogLevel } from './logger';
import { installHooks, hookRPGMakerPreTranslate } from './hook';
import aiTranslator from './aiTranslator';
import {
  getCsvFileData,
  getFileType,
  getJSONFileData,
  getPath,
  normalizeTranslationData,
  readFileAsText,
  safeJSONParse,
  stripControlChars,
} from "../utils";
import { FileFormat, Language } from '../typings/enum';
import { TinyBloom } from './bloomfilter';
import { compactRules, preTranslateTexts } from './ruleCompactor';

class Translator {
  private translationData: Data.TranslationData = {
    exactMap: new Map(),
    regexRules: [],
    ruleCount: 0,
  };
  isCustomConfig: boolean = true;
  private _skipSingleCharRegex: RegExp = /^[%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~!@#$。，、；：？！…—～（）｛｝【】《》￥$€£¥¢]$/;
  private defaultSkipRules: RegExp | null = null;
  private missStreak: number = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized: boolean = false;

  // ===== 优化新增 =====
  private bloom: TinyBloom = new TinyBloom(2048);
  private preTranslated: boolean = false;
  private preTranslateEnabled: boolean = true;
  private compactStats: any = null;

  // ==================== 生命周期 ====================

  public init() {
    if (this.initialized) return;
    this.initialized = true;
    this.initTranslatorConfig();
    this.installEngineHooks();
    this.loadStorageCache();
    aiTranslator.updateConfig();
    logger.addLog('MTool 翻译引擎初始化完成（Bloom+预翻译已启用）', LogLevel.SUCCESS);
  }

  public destroy() {
    this.saveCacheToStorage();
    this.saveTranslationData();
    cache.clear();
    this.bloom.clear();
    this.translationData = { exactMap: new Map(), regexRules: [], ruleCount: 0 };
    this.initialized = false;
    this.preTranslated = false;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    logger.addLog('MTool 翻译引擎已销毁', LogLevel.INFO);
  }

  // ==================== 配置初始化 ====================

  private async initTranslatorConfig() {
    const skipPatterns = config.defaultSkipRules.map((r) => `(${r.source})`);
    this.defaultSkipRules = new RegExp(skipPatterns.join('|'));

    const defaultRules = await normalizeTranslationData(config.TranslatorRules.default);
    if (!defaultRules) return;
    this._buildTranslationData(defaultRules);

    logger.addLog(`默认规则加载完成（${this.translationData.ruleCount} 条）`, LogLevel.INFO);
    this._rebuildBloom();
  }

  private _rebuildBloom() {
    this.bloom.clear();
    for (const key of this.translationData.exactMap.keys()) {
      this.bloom.add(key);
    }
  }

  private _buildTranslationData(rules: Data.TranslationRule[]) {
    const exactMap = new Map<string, string>();
    const regexRules: Array<{ pattern: RegExp; replacement: string }> = [];

    for (const rule of rules) {
      if (typeof rule.source === 'string') {
        exactMap.set(rule.source, rule.target);
      } else if (rule.source instanceof RegExp) {
        regexRules.push({ pattern: rule.source, replacement: rule.target });
      }
    }

    regexRules.sort((a, b) => b.pattern.source.length - a.pattern.source.length);

    this.translationData = {
      exactMap,
      regexRules,
      ruleCount: exactMap.size + regexRules.length,
    };
    this._rebuildBloom();
  }

  // ==================== 引擎 Hook 安装 ====================

  private installEngineHooks() {
    const self = this;
    setTimeout(() => {
      // 运行时 Hook（兜底 + 动态文本）
      installHooks((args: any[]) => {
        if (args?.[0] && typeof args[0] === 'string' && args[0].length > 1) {
          return self.interceptText(args);
        }
        return args;
      });

      // 预翻译 Hook（数据加载时直接替换）
      if (self.preTranslateEnabled) {
        hookRPGMakerPreTranslate(self, (text: string) => {
          return self.translateSync(text);
        });
      }
    }, 1000);
  }

  // ==================== 核心翻译流程 ====================

  /**
   * 运行时拦截（Hook 回调）
   * 
   * 优化后的流程：
   *   0. Bloom Filter → 确定不命中直接返回（跳过缓存+匹配）
   *   1. 跳过检查
   *   2. 缓存查询 O(1)（预翻译后命中率≈100%）
   *   3. 精确匹配 O(1)
   *   4. 正则匹配
   *   5. AI 回退
   */
  interceptText(args: any[]): any[] {
    if (!args?.[0] || typeof args[0] !== 'string') return args;

    const text = stripControlChars(args[0]);
    if (text.length === 0) return args;

    // 0. Bloom Filter 快速过滤（仅对较长文本，短文本直接走后续）
    if (text.length >= 3 && !this.bloom.mightContain(text)) {
      args[0] = text;
      return args;
    }

    // 1. 跳过检查
    if (this.isSkip(text)) return args;

    // 2. 缓存查询
    const cached = cache.get(text);
    if (cached !== undefined) {
      args[0] = cached;
      return args;
    }

    // 3-4. 翻译
    const result = this.doFix(text);

    // 5. 写入缓存 + Bloom
    if (result !== text) {
      cache.set(text, result);
      this.missStreak = 0;
      this.bloom.add(text);
    } else {
      cache.addIgnore(text);
      this.missStreak++;
      if (aiTranslator.isAvailable()) {
        const threshold = config.user.aiTriggerThreshold.userConfig ?? 5;
        if (this.missStreak >= threshold) {
          this._scheduleAIBatch();
        }
      }
    }

    args[0] = result;
    return args;
  }

  /**
   * 同步翻译（用于预翻译阶段 + 数据修改时）
   * 不走缓存写入（只执行一次），但会预热缓存和 Bloom
   */
  translateSync(text: string): string {
    if (!text || typeof text !== 'string') return text;
    if (text.length > 500) return text;
    if (text.length < 2) return text;

    // 1. 缓存快速路径
    const cached = cache.get(text);
    if (cached !== undefined) return cached;

    // 2. Bloom 快速过滤
    if (text.length >= 3 && !this.bloom.mightContain(text)) {
      return text;
    }

    // 3. 跳过检查
    if (this.isSkip(text)) return text;

    // 4. 精确匹配 O(1)
    const exact = this.translationData.exactMap.get(text);
    if (exact !== undefined) {
      cache.set(text, exact);
      this.bloom.add(text);
      return exact;
    }

    // 5. 正则匹配
    for (const { pattern, replacement } of this.translationData.regexRules) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        pattern.lastIndex = 0;
        const result = text.replace(pattern, replacement);
        cache.set(text, result);
        this.bloom.add(text);
        return result;
      }
    }

    return text;
  }

  doFix(text: string): string {
    if (cache.isIgnored(text)) return text;

    const exact = this.translationData.exactMap.get(text);
    if (exact !== undefined) return exact;

    let result = text;
    let replaceCount = 0;
    const maxReplace = config.user.maxReplaceCount.userConfig ?? 1;

    for (const { pattern, replacement } of this.translationData.regexRules) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        pattern.lastIndex = 0;
        result = text.replace(pattern, replacement);
        replaceCount++;
        if (replaceCount >= maxReplace) break;
      }
    }

    return result;
  }

  // ==================== 跳过判断 ====================

  isSkip(text: string): boolean {
    if (!text || typeof text !== 'string') return true;
    if (text.length > 500) return true;
    if (text.length === 1 && this._skipSingleCharRegex.test(text)) return true;
    if (this.defaultSkipRules?.test(text)) return true;
    return this.isTargetLanguage(text);
  }

  isTargetLanguage(text: string): boolean {
    const lang = config.user.targetLang.userConfig;
    switch (lang) {
      case Language.zh_CN:
      case Language.zh_TW:
        return /[\u4e00-\u9fa5]/.test(text) && !/[\u3040-\u309f\u30a0-\u30ff]/.test(text);
      case Language.en:
        return /^[\x00-\x7F]+$/.test(text) && /[a-zA-Z]/.test(text);
      case Language.ja:
        return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
      default:
        return false;
    }
  }

  // ==================== 文件加载 ====================

  async loadTranslationData(fileName: string) {
    if (!fileName) return;
    try {
      const storageKey = `cache_${fileName}`;
      const saved = localStorage.getItem(storageKey);
      if (saved && config.user.autoLoad.userConfig) {
        const parsed = safeJSONParse<any>(saved, null);
        if (parsed) {
          const rules = await normalizeTranslationData(parsed, fileName);
          if (!rules) return;
          this.mergeRules(rules);
          logger.addLog(`从缓存恢复翻译数据: ${fileName}`, LogLevel.SUCCESS);
          return;
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
      const rules = await normalizeTranslationData(rawData, fileName);
      if (!rules) return;
      this.mergeRules(rules);
      logger.addLog(`翻译文件加载成功: ${fileName}（${rules.length} 条规则）`, LogLevel.SUCCESS);
    } catch (e: any) {
      logger.addLog(`加载翻译文件失败 [${fileName}]: ${e.message}`, LogLevel.ERROR);
    }
  }

  async loadFromFile(file: File): Promise<boolean> {
    try {
      const ext = getFileType(file.name);
      let rawData: any;
      if (ext === 'json') {
        const text = await readFileAsText(file);
        rawData = safeJSONParse(text, null);
        if (!rawData) throw new Error('JSON 解析失败');
      } else if (ext === 'csv' || ext === 'tsv') {
        rawData = await readFileAsText(file);
      } else if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = (window as any).XLSX;
        if (!XLSX) { logger.addLog('XLSX 需要引入 SheetJS 库', LogLevel.ERROR); return false; }
        const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
          const r = new FileReader();
          r.onload = e => resolve(e.target!.result as ArrayBuffer);
          r.onerror = reject;
          r.readAsArrayBuffer(file);
        });
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      } else {
        logger.addLog(`不支持的文件格式: .${ext}`, LogLevel.ERROR);
        return false;
      }
      const rules = await normalizeTranslationData(rawData, file.name);
      if (!rules) return false;
      this.mergeRules(rules);
      logger.addLog(`文件加载成功: ${file.name}（${rules.length} 条规则）`, LogLevel.SUCCESS);
      return true;
    } catch (e: any) {
      logger.addLog(`文件加载失败 [${file.name}]: ${e.message}`, LogLevel.ERROR);
      return false;
    }
  }

  private mergeRules(rules: Data.TranslationRule[]) {
    const allRules: Data.TranslationRule[] = [];
    for (const [k, v] of this.translationData.exactMap) {
      allRules.push({ source: k, target: v });
    }
    for (const { pattern, replacement } of this.translationData.regexRules) {
      allRules.push({ source: pattern, target: replacement, regex: pattern });
    }
    allRules.push(...rules);
    this._buildTranslationData(allRules);
    cache.ignoretext.clear();
  }

  // ==================== 规则压缩 ====================

  /**
   * 压缩规则：将"结构相同仅数字不同"的规则聚合为正则模板
   * 
   * 例：
   *   "1日目"~"9日目" → 1 条正则 /([1-9])日目/g → "第$1天"
   *   "ミュー春/夏/秋/冬" → 1 条正则
   *   "アル春/夏/秋/冬" → 1 条正则
   *   "船Lv1"~"船Lv5" → 1 条正则
   * 
   * @param threshold 至少 N 条相似才聚合（默认 4）
   * @returns 压缩统计
   */
  compactRules(threshold: number = 4): any {
    const { exactMap, regexRules, stats } = compactRules(
      this.translationData.exactMap,
      threshold
    );
    const mergedRegex = [...regexRules, ...this.translationData.regexRules];
    mergedRegex.sort((a, b) => b.pattern.source.length - a.pattern.source.length);

    this.translationData = {
      exactMap,
      regexRules: mergedRegex,
      ruleCount: exactMap.size + mergedRegex.length,
    };
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

  /**
   * 对文本集合执行批量预翻译
   * 
   * 核心：在数据加载阶段完成所有已知文本翻译，
   *       结果预热到缓存中，运行时 Hook 直接命中 O(1)。
   * 
   * @param texts 扫描到的所有文本
   * @returns 翻译结果 Map<原文, 译文>
   */
  preTranslate(texts: Iterable<string>): Map<string, string> {
    const result = preTranslateTexts(
      texts,
      this.translationData.exactMap,
      this.translationData.regexRules,
      (original, translated) => {
        cache.set(original, translated);
        this.bloom.add(original);
      }
    );
    this.preTranslated = true;
    logger.addLog(
      `预翻译完成: ${result.size} 条文本已翻译并预热到缓存`,
      LogLevel.SUCCESS
    );
    return result;
  }

  isPreTranslated(): boolean { return this.preTranslated; }
  setPreTranslateEnabled(enabled: boolean) { this.preTranslateEnabled = enabled; }

  // ==================== 规则处理（兼容旧 API）====================

  async processRules(ruleArray: any) {
    const rules = await normalizeTranslationData(ruleArray, 'processRules');
    if (!rules) return;
    this._buildTranslationData(rules);
    cache.ignoretext.clear();
    logger.addLog(`规则处理完成（${rules.length} 条）`, LogLevel.SUCCESS);
  }

  parseConfig(data: any, fileName: string): any {
    return normalizeTranslationData(data, fileName);
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
    const texts = Array.from(cache.ignoretext).slice(-20);
    if (texts.length === 0) return;
    try {
      const results = await aiTranslator.translateBatch(texts);
      let newCount = 0;
      for (const [original, translated] of results) {
        if (translated && translated !== original) {
          this.translationData.exactMap.set(original, translated);
          cache.ignoretext.delete(original);
          this.bloom.add(original);
          newCount++;
        }
      }
      if (newCount > 0) {
        this.translationData.ruleCount =
          this.translationData.exactMap.size + this.translationData.regexRules.length;
        logger.addLog(`AI 翻译新增 ${newCount} 条规则`, LogLevel.SUCCESS);
      }
    } catch (e: any) {
      logger.addLog(`AI 批量翻译失败: ${e.message}`, LogLevel.ERROR);
    }
  }

  // ==================== 持久化 ====================

  private saveCacheToStorage() { cache.saveCacheToStorage('LocalTranslatorGameCache'); }
  private loadStorageCache() { cache.loadStorageCache('LocalTranslatorGameCache'); }

  saveTranslationData() {
    if (!config.user.autoLoad.userConfig) return;
    const data = {
      exactMap: Array.from(this.translationData.exactMap.entries()),
      regexRules: this.translationData.regexRules.map(r => ({
        pattern: r.pattern.source, flags: r.pattern.flags, replacement: r.replacement,
      })),
    };
    try { localStorage.setItem(`cache_${config.user.fileName.userConfig}`, JSON.stringify(data)); }
    catch (e) { console.warn('[Translator] 保存翻译数据失败:', e); }
  }

  // ==================== 统计与导出 ====================

  getStats() {
    const cacheStats = cache.getHitRate();
    return {
      rules: this.translationData.ruleCount,
      exactRules: this.translationData.exactMap.size,
      regexRules: this.translationData.regexRules.length,
      cacheSize: cache.size,
      ignoreSize: cache.ignoreSize,
      cacheHitRate: cacheStats.hitRate,
      cacheTotal: cacheStats.total,
      aiCache: aiTranslator.getCacheStats(),
      bloomSize: this.bloom.count,
      bloomBytes: this.bloom.byteSize,
      preTranslated: this.preTranslated,
      compactStats: this.compactStats,
    };
  }

  exportRules(format: FileFormat = FileFormat.JSON): { data: string; fileName: string } {
    const { exactMap, regexRules } = this.translationData;
    const d = new Date();
    const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

    if (format === FileFormat.JSON) {
      const obj: Record<string, string> = {};
      for (const [k, v] of exactMap) obj[k] = v;
      for (const { pattern, replacement } of regexRules) {
        obj[`/${pattern.source}/${pattern.flags}`] = replacement;
      }
      return { data: JSON.stringify(obj, null, 2), fileName: `MTool_Export_${ts}.json` };
    }
    if (format === FileFormat.CSV) {
      const rows = [['source', 'target']];
      for (const [k, v] of exactMap) rows.push([k, v]);
      for (const { pattern, replacement } of regexRules) {
        rows.push([`/${pattern.source}/${pattern.flags}`, replacement]);
      }
      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      return { data: csv, fileName: `MTool_Export_${ts}.csv` };
    }
    const rows = [['source', 'target']];
    for (const [k, v] of exactMap) rows.push([k, v]);
    for (const { pattern, replacement } of regexRules) {
      rows.push([`/${pattern.source}/${pattern.flags}`, replacement]);
    }
    const tsv = rows.map(r => r.map(c => String(c).replace(/\t/g, ' ')).join('\t')).join('\n');
    return { data: tsv, fileName: `MTool_Export_${ts}.tsv` };
  }

  reset() {
    this.translationData = { exactMap: new Map(), regexRules: [], ruleCount: 0 };
    cache.clear();
    this.bloom.clear();
    aiTranslator.clearCache();
    this.preTranslated = false;
    this.compactStats = null;
    logger.addLog('所有翻译数据已重置', LogLevel.WARNING);
  }
}

const translator = new Translator();
export default translator;
