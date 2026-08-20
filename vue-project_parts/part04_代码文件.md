# 项目代码文件（第 4 部分）

> 本文件包含 8 个文件

---

## `src/core/logger.ts`

```ts
import { reactive } from 'vue';
import config from '../config';

export enum LogLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  SUCCESS = 'success',
  DEBUG = 'debug',
}

export type LogFilter = LogLevel | 'total';

export type LogEntry = {
  id: number;
  text: string;
  level: LogLevel;
  timestamp: number;
}

class Logger {
  private maxLogCount: number;
  private _id = 0;
  public log_queue = reactive<LogEntry[]>([]);

  constructor(maxLogCount: number = 50) {
    this.maxLogCount = maxLogCount;
  }

  addLog(text: any, level: LogLevel = LogLevel.INFO) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const entry: LogEntry = {
      id: ++this._id,
      text: `[${time}] ${String(text)}`,
      level,
      timestamp: Date.now(),
    };
    this.log_queue.push(entry);
    this._trim();
    this._consoleOutput(text, level);
  }

  addLogs(texts: any[], level: LogLevel = LogLevel.INFO) {
    for (const t of texts) this.addLog(t, level);
  }

  clearLog() {
    this.log_queue.splice(0, this.log_queue.length);
  }

  exportLogs(): string {
    return this.log_queue
      .map((e: LogEntry) => `[${e.level}] ${e.text}`)
      .join('\n');
  }

  getFiltered(filter: LogFilter): LogEntry[] {
    if (filter === 'total') return [...this.log_queue];
    return this.log_queue.filter((e: LogEntry) => e.level === filter);
  }

  get stats() {
    const counts: Record<LogLevel, number> = {
      [LogLevel.INFO]: 0,
      [LogLevel.WARNING]: 0,
      [LogLevel.ERROR]: 0,
      [LogLevel.SUCCESS]: 0,
      [LogLevel.DEBUG]: 0,
    };
    for (const e of this.log_queue) counts[e.level]++;
    return { ...counts, total: this.log_queue.length };
  }

  setMaxCount(n: number) {
    this.maxLogCount = Math.max(10, n);
    this._trim();
  }

  private _trim() {
    while (this.log_queue.length > this.maxLogCount) {
      this.log_queue.shift();
    }
  }

  private _consoleOutput(text: any, level: LogLevel) {
    const styles: Record<LogLevel, string> = {
      [LogLevel.INFO]: 'color: #197dea',
      [LogLevel.WARNING]: 'color: #f39c12',
      [LogLevel.ERROR]: 'color: #e74c3c',
      [LogLevel.SUCCESS]: 'color: #2ecc71',
      [LogLevel.DEBUG]: 'color: #95a5a6',
    };
    console.log(`%c[MToolTranslatorPlugin] ${text}`, styles[level]);
  }
}

const logger = new Logger(config.user.maxLogCount.default);
export default logger;
```

## `src/core/mootHook.ts`

```ts
/**
 * mootHook.ts — Moot 平台 AI 翻译 Hook（重构版）
 *
 * 修复（Bug 修复）：
 *  - 消除与 wsHook.ts / hooks/websocket.ts 的重复实现
 *  - 改为组合使用统一的 WebSocketHook 类
 *  - 修复 pendingMap → this.pendingRequests 引用错误
 *  - 三列规则 (aaa/bbb/ccc) 正确解析
 *  - 增加 console.log 调试输出
 */

import logger, { LogLevel } from './logger';
import { WebSocketHook } from './hooks/websocket';
import translator from './translator';
import aiFixRules, { type AIFixRule } from './aiFixRules';
import config from '../config';
import { safeJSONParse, xhrRequest } from '../utils';

// ==================== 类型 ====================

export interface MootRule {
  aaa: string | RegExp;
  bbb: string | RegExp | null;
  ccc: string;
  _isRegex?: boolean;
}

type MootStats = {
  enabled: boolean;
  installed: boolean;
  requestsSeen: number;
  requestsIntercepted: number;
  responsesSeen: number;
  responsesFixed: number;
  responsesLearned: number;
  cacheHitRate: string;
}

// ==================== 主类 ====================

class MootHookManager {
  private wsHook: WebSocketHook | null = null;
  private rules: MootRule[] = [];
  private stats: MootStats = {
    enabled: false,
    installed: false,
    requestsSeen: 0,
    requestsIntercepted: 0,
    responsesSeen: 0,
    responsesFixed: 0,
    responsesLearned: 0,
    cacheHitRate: '0%',
  };
  private enabled = false;
  private apiUrl: string = 'http://127.0.0.1:64002/wslikecmd';
  private nextId = 0;

  // ==================== 安装/卸载 ====================

  aifixResponse(original: string, aiResult: string) {
    this.stats.responsesSeen++;
    if (!aiResult || aiResult === original) return aiResult;

    // Step 1: aiFixRules 后修正
    let fixed = aiResult;
    try { fixed = aiFixRules.fix(original, aiResult); } catch { fixed = aiResult; }

    // Step 2: Moot 自定义规则
    fixed = this._applyMootRules(original, fixed);

    // Step 3: 写回主缓存（学习）
    if (fixed && fixed !== original) {
      try {
        translator.fixAITranslation(original, fixed);
      } catch { /* ignore */ }
      this.stats.responsesLearned++;
    }

    if (fixed !== aiResult) {
      this.stats.responsesFixed++;
      if (config.debug) {
        console.log(`[MToolTranslatorPlugin][Moot] ✏️ 响应修复: "${aiResult.slice(0, 20)}..." → "${fixed.slice(0, 30)}..."`);
      }
    }
    return fixed;
  }

  install(options: {
    apiUrl?: string;
    interceptRequest?: boolean;
    processResponse?: boolean;
    debug?: boolean;
  } = {}): boolean {
    if (this.enabled) {
      logger.addLog('[Moot] 已安装，跳过', LogLevel.WARNING);
      return false;
    }

    this.apiUrl = options.apiUrl || config.user.mootApiUrl?.userConfig || this.apiUrl;

    const wsOptions: Options.WebSocketHookOptions = {
      targetURL: this._extractHost(this.apiUrl),
      enableRequestFix: options.interceptRequest ?? true,
      enableResponseFix: options.processResponse ?? true,
      translateFn: (text: string) => {
        this.stats.requestsSeen++;
        // 查主缓存 → 查翻译规则 → 返回 null 表示不拦截
        try {
          const cached = translator.interceptText(text);
          if (cached && cached !== text) {
            this.stats.requestsIntercepted++;
            if (config.debug)
              console.log(`[MToolTranslatorPlugin][Moot] 💾 缓存命中: "${text.slice(0, 20)}..." → "${cached.slice(0, 30)}..."`);
            return cached;
          }
        } catch { /* ignore */ }
        return null; // 不拦截，让 AI 处理
      },
      fixResponseFn: this.aifixResponse,
    };

    this.wsHook = new WebSocketHook(wsOptions);
    const ok = this.wsHook.install();

    if (ok) {
      this.enabled = true;
      this.stats.enabled = true;
      this.stats.installed = true;
      logger.addLog(`[Moot] Hook 已安装 (API: ${this.apiUrl})`, LogLevel.SUCCESS);
      return true;
    }

    return false;
  }

  uninstall(): void {
    if (this.wsHook) {
      this.wsHook.uninstall();
      this.wsHook = null;
    }
    this.enabled = false;
    this.stats.enabled = false;
    this.stats.installed = false;
    if (config.debug) {
      console.log('[MToolTranslatorPlugin][Moot] ↩️ Moot Hook 已卸载');
    }
    logger.addLog('[Moot] Hook 已卸载', LogLevel.INFO);
  }

  // ==================== 规则管理 ====================

  addRule(aaa: string | RegExp, bbb: string | RegExp | null, ccc: string): void {
    const isRegex = typeof aaa !== 'string' || typeof bbb === 'string' && bbb.startsWith('/');
    const rule: MootRule = {
      aaa,
      bbb: bbb || null,
      ccc,
      _isRegex: isRegex,
    };
    this.rules.push(rule);
    if (config.debug)
      console.log(`[MToolTranslatorPlugin][Moot] ➕ 规则: "${String(aaa).slice(0, 20)}" → "${ccc.slice(0, 30)}"`);
    logger.addLog(`[Moot] 规则已添加: ${String(aaa).slice(0, 20)} → ${ccc.slice(0, 20)}`, LogLevel.SUCCESS);
  }

  clearRules(): void {
    const count = this.rules.length;
    this.rules = [];
    if (config.debug) {
      console.log(`[MToolTranslatorPlugin][Moot] 🧹 清除 ${count} 条规则`);
    }
    logger.addLog(`[Moot] 已清除 ${count} 条规则`, LogLevel.WARNING);
  }

  getRules(): MootRule[] {
    return [...this.rules];
  }

  get ruleCount(): number {
    return this.rules.length;
  }

  // ==================== 文件加载 ====================

  async loadRulesFromFile(file: File): Promise<number> {
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let rules: MootRule[] = [];

      if (ext === 'json') {
        const text = await file.text();
        const data = safeJSONParse(text);
        rules = this._parseRulesFromData(data);
      } else if (ext === 'csv' || ext === 'tsv') {
        const text = await file.text();
        const delimiter = ext === 'csv' ? ',' : '\t';
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        for (const line of lines) {
          const cols = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
          if (cols.length >= 3 && cols[0] && cols[2]) {
            rules.push({ aaa: cols[0], bbb: cols[1] || null, ccc: cols[2] });
          }
        }
      } else if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = (window as any).XLSX;
        if (!XLSX) throw new Error('XLSX 需要引入 SheetJS 库');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        for (const row of rows) {
          if (Array.isArray(row) && row.length >= 3 && row[0] && row[2]) {
            rules.push({ aaa: row[0], bbb: row[1] || null, ccc: row[2] });
          }
        }
      } else {
        throw new Error(`不支持的文件格式: .${ext}`);
      }

      // 同时写入 aiFixRules（三列规则通用）
      const aiRules: AIFixRule[] = rules.map(r => ({
        aaa: r.aaa,
        bbb: r.bbb || '',
        ccc: r.ccc,
        _isRegex: r._isRegex,
      }));
      aiFixRules.addRules(aiRules);

      this.rules.push(...rules);
      logger.addLog(`[Moot] 规则文件加载成功: ${file.name}（${rules.length} 条）`, LogLevel.SUCCESS);
      return rules.length;
    } catch (e: any) {
      logger.addLog(`[Moot] 规则文件加载失败: ${e.message}`, LogLevel.ERROR);
      throw e;
    }
  }

  // ==================== 测试翻译 ====================

  testTranslate(text: string): Promise<string> {
    if (!this.enabled) throw new Error('Moot Hook 未启用');
    if (text.trim() === '') throw new Error('测试文本不能为空');
    return new Promise((resolve, reject) => {
      // 先查本地
      const local = translator.interceptText(text);
      if (local && local !== text) {
        resolve(`[本地] ${local}`);
        return;
      }
      const payload = {
        id: this.nextId++,
        type: 1,
        target: 1,
        cmd: 'trs',
        args: [text],
      } as API.MootRequest
      xhrRequest(this.apiUrl, 'POST', {
        'Content-Type': 'text/plain;charset=UTF-8',
      }, payload
      ).then((response: API.MootResponse) => {
        if (response.type !== 1) throw new Error('Moot Hook 响应类型错误');
        if (response.error) throw new Error(response.ret || '未知Moot Hook 错误');
        const ret = response.ret || '';
        if (ret === '') throw new Error('Moot Hook 响应内容为空');
        const fixed = this._applyMootRules(text, ret);
        if (fixed !== text) {
          translator.addCache(text, fixed);
        }
        resolve(`[AI回复] ${ret}`);
      }).catch((err) => {
        logger.addLog(`[Moot] 测试翻译失败: ${err.message}`, LogLevel.ERROR);
        reject('[无回复] 后台可能未启动 ' + err.message);
      });
    });
  }


  // ==================== 统计 ====================

  getStats(): MootStats {
    const cacheStats = (translator as any).stats;
    if (cacheStats?.cacheHitRate !== undefined) {
      this.stats.cacheHitRate = `${cacheStats.cacheHitRate}%`;
    }
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      enabled: this.enabled,
      installed: this.stats.installed,
      requestsSeen: 0,
      requestsIntercepted: 0,
      responsesSeen: 0,
      responsesFixed: 0,
      responsesLearned: 0,
      cacheHitRate: '0%',
    };
    console.log('[MToolTranslatorPlugin][Moot] 📊 统计已重置');
  }

  // ==================== 内部方法 ====================

  private _applyMootRules(original: string, text: string): string {
    let result = text;
    for (const rule of this.rules) {
      try {
        if (rule._isRegex) {
          const aaa = rule.aaa instanceof RegExp ? rule.aaa : new RegExp(rule.aaa);
          const bbb = rule.bbb ? (rule.bbb instanceof RegExp ? rule.bbb : new RegExp(rule.bbb)) : null;

          if (aaa.test(original)) {
            if (!bbb || bbb.test(result)) {
              result = result.replace(bbb || aaa, rule.ccc);
            }
          }
        } else {
          if (original === rule.aaa) {
            if (!rule.bbb || result.includes(rule.bbb as string)) {
              result = rule.ccc;
            }
          }
        }
      } catch (e) { /* ignore */ }
    }
    return result;
  }

  private _parseRulesFromData(data: any): MootRule[] {
    const rules: MootRule[] = [];

    // CollData.json 格式
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const key of Object.keys(data)) {
        const item = data[key];
        if (item?.data && Array.isArray(item.data)) {
          for (const row of item.data) {
            if (Array.isArray(row) && row.length >= 3 && row[0] && row[2]) {
              const isRegex = typeof row[1] === 'string' && row[1].startsWith('/');
              rules.push({
                aaa: row[0],
                bbb: row[1] || null,
                ccc: row[2],
                _isRegex: isRegex,
              });
            }
          }
        }
      }
    }

    // 普通数组格式
    if (Array.isArray(data)) {
      for (const item of data) {
        if (Array.isArray(item) && item.length >= 3 && item[0] && item[2]) {
          rules.push({ aaa: item[0], bbb: item[1] || null, ccc: item[2] });
        } else if (item && typeof item === 'object') {
          const aaa = item.aaa || item.source || item.original;
          const bbb = item.bbb || item.pattern || item.match || null;
          const ccc = item.ccc || item.target || item.replacement;
          if (aaa && ccc) {
            rules.push({ aaa, bbb, ccc, _isRegex: typeof aaa !== 'string' });
          }
        }
      }
    }

    return rules;
  }

  private _extractHost(url: string): string {
    try {
      if (url.startsWith('ws://') || url.startsWith('wss://')) {
        return new URL(url).host;
      }
      // 形如 http://127.0.0.1:64002/wslikecmd
      return new URL(url).host;
    } catch {
      // 直接返回原始字符串的子串
      const m = url.match(/:\/\/([^/]+)/);
      return m ? m[1] : url;
    }
  }
}

const mootHook = new MootHookManager();
export default mootHook;
```

## `src/core/ruleCompactor.ts`

```ts
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
```

## `src/core/translator.ts`

```ts
/**
 * translator.ts — 翻译引擎核心（修复版）
 *
 * 修复（Bug 修复）：
 *  - doFix() 中 `let data=null` 缺少 let/const 关键字
 *  - 新增 loadUniversalFile() 统一上传入口
 *  - 自动区分两列（翻译规则）/ 三列（AI Fix 规则）/ CollData.json
 *  - 修正 isSkip 对日文标点误判
 */

import config from '../config';
import cache from './cache';
import logger, { LogLevel } from './logger';
import { installEngineHooks } from './hookManager';
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
} from '../utils';
import { Language } from '../typings/enum';
import { TinyBloom } from './bloomFilter';
import { compactRules, preTranslateTexts } from './ruleCompactor';

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
  private _skipSingleCharRegex: RegExp = /^[%^&*()_+･\-=\[\]{};':"\\|,.<>\/?`~♪一!@#$♡。，、；：？！…—～（）｛｝【】《》￥$€£¥¢]+$/;
  private defaultSkipRules: RegExp | null = null;
  private missStreak: number = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized: boolean = false;

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
    logger.addLog('MTool 翻译引擎已销毁', LogLevel.INFO);
  }

  // ==================== 配置初始化 ====================

  private async _initConfig() {
    const skipPatterns = config.defaultSkipRules.map((r: RegExp) => `(${r.source})`);
    this.defaultSkipRules = new RegExp(skipPatterns.join('|'));

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
    setTimeout(() => {
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
              if (data && data.cmd && typeof data.cmd === 'string' && data.cmd === 'trs' && data.args && data.args.length > 0 && data.type && typeof data.type === 'number' && data.type === 1) {
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

      // if (self.preTranslateEnabled) {
      //   hookRPGMakerPreTranslate(self, (...args: any[]) => {
      //     if (!args || args.length === 0) return args;
      //     if (typeof args[0] !== 'string') return args;
      //     return self.interceptText(args);
      //   });
      // }
    }, 1000);
  }

  // ==================== 数据构建 ====================

  private _buildInto(target: Data.TranslationData, rules: Data.TranslationRule[]) {
    const exactMap = new Map<string, string>();
    const regexRules: Array<{
      pattern: RegExp;
      replacement: string
    }> = [];

    for (const rule of rules) {
      if (typeof rule.source === 'string') {
        exactMap.set(rule.source, rule.target);
      } else if (rule.source instanceof RegExp) {
        regexRules.push({ pattern: rule.source, replacement: rule.target });
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
  }

  private _rebuildBloom() {
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
    const rawText = String.raw`${text.trim()}`;
    const text_ = stripControlChars(rawText);

    if (
      !text_ ||
      text_.length < 2 ||
      text_.length > 500 ||
      (text_.length >= 3 && !this.bloom.mightContain(text_)) || // 1. Bloom Filter 快速过滤
      this.isSkip(text_)   // 2. 跳过检查
    ) {
      if (config.debug) {
        console.log("跳过翻译", text);
      }
      return text;
    }

    // 3. 缓存查询
    const cached = cache.get(text_);
    if (cached !== undefined) {
      return cached;
    }

    // 4. 规则翻译
    const result = this.doFix(text_);
    if (config.debug) {
      console.log("规则翻译", text, result);
    }
    if (result !== text_) {
      this.addCache(text_, result);
      return result;
    }

    // 5. 未命中 → 忽略 + 触发 AI
    cache.addIgnore(text);
    this.missStreak++;
    if (aiTranslator.isAvailable) {
      const threshold = config.user.aiTriggerThreshold.userConfig ?? 5;
      if (this.missStreak >= threshold) {
        this._scheduleAIBatch();
      }
    }
    return text;
  }

  public addCache(text: string, result: string = "") {
    text = text.trim();
    cache.set(text, result.trim(), true);
    this.missStreak = 0;
    this.bloom.add(text);
  }

  /**
   * 查找匹配的规则
   */
  private doFix(text: string): string {
    if (!text || typeof text !== 'string') return text;
    if (cache.isIgnored(text)) return text;
    if (isResourcePath(text)) return text;

    let data: Data.TranslationData | null = null;
    if (this.userData.ruleCount > 0) {
      data = this.userData;
    } else {
      data = this.defaultData;
    }

    // 用户精确
    const exact = data.exactMap.get(text);
    if (exact !== undefined) return exact;

    let result = text;
    let replaceCount = 0;
    const maxReplace = config.user.maxReplaceCount.userConfig ?? 1;

    // 用户正则
    for (const { pattern, replacement } of data.regexRules) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        pattern.lastIndex = 0;
        result = text.replace(pattern, replacement);
        if (result !== text) {
          replaceCount++;
          if (replaceCount >= maxReplace) {
            break;
          }
        };
      }
    }
    return result;
  }

  // ==================== 跳过判断 ====================

  private isSkip(text: string): boolean {
    if (this._skipSingleCharRegex.test(text)) return true;
    if (this.defaultSkipRules?.test(text)) return true;
    return this.isTargetLanguage(text);
  }

  isTargetLanguage(text: string): boolean {
    const lang = config.user.targetLang.userConfig;
    switch (lang) {
      case Language.zh_CN:
      case Language.zh_TW:
        // ✅ Bug 修复：日文到中文翻译时，原文含日文假名不应跳过
        return false; // 日文原文需要翻译，不跳过
      case Language.en:
        return /^[\x00-\x7F]+$/.test(text) && /[a-zA-Z]/.test(text);
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

    this.bloom.add(original);

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
    aiFixRules.addRule({
      aaa, bbb, ccc,
      _isRegex: typeof aaa !== 'string' || (typeof bbb === 'string' && bbb.startsWith('/')),
    });
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
    if (this._isCollDataFormat(rawData)) {
      console.log(`[MToolTranslatorPlugin][Upload] 检测到 CollData.json 格式`);
      const rules = this._parseCollData(rawData);
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
    if (Array.isArray(rawData)) {
      // CSV/TSV 文本 → 先解析
      if (typeof rawData === 'string' || (rawData.length > 0 && typeof rawData[0] === 'string')) {
        const delimiter = ext === 'csv' ? ',' : (ext === 'tsv' ? '\t' : ',');
        if (typeof rawData === 'string') {
          rawData = parseDelimited(rawData, delimiter);
        }
      }

      return this._classifyAndLoad(rawData, fileName);
    }

    // === 对象格式 { "原文": "译文" } ===
    if (typeof rawData === 'object' && rawData !== null) {
      const rules: Data.TranslationRule[] = [];
      for (const [k, v] of Object.entries(rawData)) {
        if (typeof v === 'string' && k && v) {
          rules.push({ source: k, target: v });
        }
      }
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

    console.log(`[MToolTranslatorPlugin][Upload] 采样 ${sampleSize} 行: 三列=${threeColumnCount}, 两列=${twoColumnCount}`);

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
          transRules.push({ source: String(row[0]).trim(), target: String(row[1]).trim() });
        }
      }

      if (transRules.length > 0) {
        this._buildInto(this.userData, transRules);
        this._mergeToRuntime();
        this._rebuildBloom();
      }
      if (aiRules.length > 0) {
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

  // ==================== CollData 解析 ====================

  private _isCollDataFormat(data: any): boolean {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    // CollData.json: { "25045": { id, name, data: [[...], ...] } }
    const firstKey = Object.keys(data)[0];
    if (!firstKey) return false;
    const firstVal = data[firstKey];
    return firstVal && Array.isArray(firstVal.data) && firstVal.data.length > 0;
  }

  private _parseCollData(data: any): Data.TranslationRule[] {
    const rules: Data.TranslationRule[] = [];
    for (const key of Object.keys(data)) {
      const item = data[key];
      if (!item?.data || !Array.isArray(item.data)) continue;
      for (const row of item.data) {
        if (!Array.isArray(row)) continue;
        // CollData 格式: [source, pattern/regex, target]
        if (row.length >= 3 && row[0] && row[2]) {
          const src = String(row[0]).trim();
          const tgt = String(row[2]).trim();
          if (src && tgt && !src.startsWith('【') && !src.startsWith('[')) {
            // 检测是否为正则
            if (typeof row[1] === 'string' && row[1].startsWith('/') && row[1].endsWith('/')) {
              try {
                const inner = row[1].slice(1, -1);
                rules.push({ source: new RegExp(inner, 'g'), target: tgt });
              } catch {
                rules.push({ source: src, target: tgt });
              }
            } else {
              rules.push({ source: src, target: tgt });
            }
          }
        }
      }
    }
    return rules;
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
    const result = preTranslateTexts(
      texts,
      this.translationData.exactMap,
      this.translationData.regexRules,
      (original: string, translated: string) => {
        cache.set(original, translated);
        this.bloom.add(original);
        if (!this.userData.exactMap.has(original)) {
          this.userData.exactMap.set(original, translated);
          this.userData.ruleCount = this.userData.exactMap.size + this.userData.regexRules.length;
        }
      }
    );
    this.preTranslated = true;
    this._mergeToRuntime();
    logger.addLog(`预翻译完成: ${result.size} 条文本已翻译并预热到缓存`, LogLevel.SUCCESS);
    return result;
  }

  isPreTranslated(): boolean { return this.preTranslated; }
  setPreTranslateEnabled(enabled: boolean) { this.preTranslateEnabled = enabled; }

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

  private _saveCacheToStorage() { cache.saveToStorage(this.cacheStorageKey); }

  private _loadStorageCache() { cache.loadFromStorage(this.cacheStorageKey); }

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

  exportRules(format: "json" | "csv" = "json"): { data: any; fileName: string } {
    const d = new Date();
    const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

    const allExact = new Map<string, string>();
    for (const [k, v] of this.userData.exactMap) allExact.set(k, v);
    for (const [k, v] of cache.exportEntries()) {
      if (!allExact.has(k)) allExact.set(k, v);
    }
    const allRegex = [...this.userData.regexRules];

    if (format === "json") {
      const obj: Record<string, string> = {};
      for (const [k, v] of allExact) obj[k] = v;
      for (const { pattern, replacement } of allRegex) {
        obj[`/${pattern.source}/${pattern.flags}`] = replacement;
      }
      return {
        data: obj,
        fileName: `MTool_Export_${ts}.json`
      };
    }

    if (format === "csv") {
      const rows = [['source', 'target']];
      for (const [k, v] of allExact) rows.push([k, v]);
      for (const { pattern, replacement } of allRegex) {
        rows.push([`/${pattern.source}/${pattern.flags}`, replacement]);
      }
      return {
        data: rows,
        fileName: `MTool_Export_${ts}.csv`
      };
    }

    const rows = [['source', 'target']];
    for (const [k, v] of allExact) rows.push([k, v]);
    for (const { pattern, replacement } of allRegex) {
      rows.push([`/${pattern.source}/${pattern.flags}`, replacement]);
    }
    return {
      data: rows,
      fileName: `MTool_Export_${ts}.tsv`
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
```

## `src/main.css`

```css
:root{
  --accent-bg: linear-gradient(90deg, rgba(0, 118, 253, 0.44) 0%, rgba(255, 255, 255, 0.1) 100%);
  --accent-color: #e8f4fd;
  --accent-color-dark: #1559b3;
  --success-color: #e8f8f0;
  --warning-color: #fdf6e3;
  --danger-color: #fdf0f0;
  --purple-color: #9b59b6;
}

.transparent-glass {
  overflow: hidden;
  transition: all 0.3s ease;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.8);
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}
```

## `src/main.ts`

```ts
import config from './config';
import translator from './core/translator';
import cache from './core/cache';
import logger, { LogLevel } from './core/logger';
import aiTranslator from './core/aiTranslator';
import mootHook from './core/mootHook';
import { download } from './utils';
import { installEngineHooks } from './core/hookManager';

function install() {
  if (config.user.autoLoad.userConfig) {
    translator.init();
    const defaultFile = config.user.fileName.userConfig;
    if (defaultFile && defaultFile !== config.user.fileName.default) {
      translator.loadTranslationData(defaultFile);
    }
  }

  if (config.user.mootHookEnabled.userConfig) {
    const apiUrl = config.user.mootApiUrl.userConfig || config.user.AI_BASE_URL.default;
    mootHook.install({ apiUrl });
  }
}

window.MToolTranslatorPlugin = {
  translator,
  cache,
  logger,
  config,
  aiTranslator,
  load: (...args: any[]): Promise<boolean|void> => {
    const file = args[0];
    if (typeof file === 'string') return translator.loadTranslationData(file);
    return translator.loadFromFile(file);
  },
  export: async (...args: any[]) => {
    const format = args[0];
    const fmt = (format === 'csv' ? 'csv' : format === 'tsv' ? 'tsv' : 'json') as any;
    const { data, fileName } = translator.exportRules(fmt);
    await download(data, fileName, fmt);
  },
  reset: () => translator.reset(),
  stats: () => translator.stats,
  log: (text: string, level: LogLevel = LogLevel.INFO) => logger.addLog(text, level),
  testAI: () => aiTranslator.translate('テスト'),
  setDebug: (debug: boolean) => config.debug = debug,
  hookAPI: installEngineHooks,
};

install();

logger.addLog('MToolTranslatorPlugin v0.2.0 已启动', LogLevel.SUCCESS);
console.log('%c[MToolTranslatorPlugin] v0.2.0 Ready! ', 'color: #197dea; font-weight: bold;');
console.log('%c[MootHook] window.MToolTranslatorPlugin 访问 MootHookAPI', 'color: #9b59b6; font-weight: bold;');

export default window.MToolTranslatorPlugin;
```

## `src/utils.ts`

```ts
export async function saveJSONFile(jsonData: Record<string, any>,fileName: string) {
  await download(jsonData, `${fileName}.json`, 'json');
}

// ==================== 文件读取 ====================

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve((e.target?.result as string) || '');
    reader.onerror = () => reject(new Error(`读取文件失败: ${file.name}`));
    reader.readAsText(file, 'UTF-8');
  });
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as ArrayBuffer);
    reader.onerror = () => reject(new Error(`读取文件失败: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

// ==================== 文件类型判断 ====================

export function getFileType(fileName: string): string {
  const parts = fileName.split('.');
  if (parts.length < 2) return '';
  return parts.pop()!.toLowerCase();
}

// ==================== 环境检测 ====================

export function checkNodeJS(): boolean {
  return typeof (module as any) !== 'undefined' && !!(module as any).exports;
}

export function getNodeJSModule(moduleName: string): any {
  if (checkNodeJS()) {
    try {
      return require(moduleName);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// ==================== 网络请求 ====================

const oriFetch = window.fetch;

export async function request(
  url: string,
  method: string = 'GET',
  headers?: Record<string, string>
): Promise<Response> {
  const response = await oriFetch(url, { method, headers });
  if (response.ok) return response;
  throw new Error(`请求失败 [${response.status}]: ${url}`);
}

export async function getJSONFileData(
  url: string,
  callback?: (data: Record<string, any>) => any
): Promise<any> {
  const response = await request(url, 'GET', { 'Content-Type': 'application/json' });
  const data = await response.json();
  return typeof callback === 'function' ? callback(data) : data;
}

export async function getCsvFileData(url: string): Promise<string[][]> {
  const response = await request(url, 'GET', { 'Content-Type': 'text/csv' });
  const text = await response.text();
  return parseDelimited(text,',');
}

// ==================== 路径处理 ====================

export async function getPath(fileName: string): Promise<string> {
  if (checkNodeJS()) {
    try {
      const path = await getGameCWD();
      if (path) return `${path}/${fileName}`;
    } catch {}
  }
  return fileName;
}

// ==================== 正则解析（统一工具）====================
export function parseRegex(str: any): any {
  if (typeof str !== 'string') return str;
  const m = str.match(/^\/(.+?)\/([gimsuy]*)$/);
  if (m) {
    try {
      const flags = m[2] || 'g';
      const finalFlags = flags.includes('g') ? flags : flags + 'g';
      return new RegExp(m[1], finalFlags);
    } catch {
      return str;
    }
  }
  return str;
}

export function isRegexPattern(val: any): boolean {
  if (val instanceof RegExp) return true;
  if (typeof val !== 'string') return false;
  return /^\/.+\/[gimsuy]*$/.test(val);
}

// ==================== CSV / TSV 解析 ====================

export function parseDelimited(csvContent: string, delimiter:string): string[][] {
  const rows: string[][] = [];
  const lines = csvContent.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const values = line.split(new RegExp(`${delimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)`));
    rows.push(values.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"').trim()));
  }
  return rows;
}

export function parseTSV(content: string): string[][] {
  return parseDelimited(content, '\t');
}

// ==================== XLSX 解析 ====================

export async function parseXLSX(file: File): Promise<string[][]> {
  const XLSX = window.XLSX || getNodeJSModule('xlsx');
  if (XLSX) {
    const buf = await readFileAsArrayBuffer(file);
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
  }
  throw new Error('未检测到 SheetJS 库，请引入 xlsx.js 后重试，或改用 CSV/JSON 格式');
}

// ==================== 翻译数据解析（统一入口）====================

type TranslateDataNormalized = Array<{
  source: string | RegExp;
  target: string;
  regex?: RegExp;
}>;

/**
 * 将任意格式的翻译数据统一为标准规则数组
 * 支持格式：
 *   1. { "原文": "译文" } 的 JSON 对象
 *   2. [["原文","译文"], ...] 的二维数组
 *   3. [["原文","正则","译文"], ...] 的三维数组
 *   4. CollData.json格式: { "25045": { id, name, data: [[...], ...] } }
 */
export function normalizeTranslationData(
  data: any,
  isDefault: boolean = false
): TranslateDataNormalized {
  if (!data) throw new Error('未提供有效的翻译数据');

  if (isDefault) {
    const rules: TranslateDataNormalized = [];
    for (const [k, v] of Object.entries(data)) {
      if (typeof v !== 'string') continue;
      try {
        const parsed = new RegExp(k, 'g');
        rules.push({
          source: parsed,
          target: v,
          regex: parsed,
        });
      } catch {
        rules.push({
          source: k,
          target: v
        });
      }
    }
    return rules;
  }

  // 情况1: CollData.json 格式
  if (isCollDataFormat(data)) {
    const keys = Object.keys(data);
    let first = data[keys[0]];
    for (const key of keys) {
      const item = data[key];
      if (item.type === "trs" && item.data && item.data.length > 0) {
        first = item;
        break;
      }
    }
    if (first && typeof first === 'object' && 'data' in first && Array.isArray(first.data)) {
      return parseCollData(data);
    }
    return [];
  }

  // 情况2/3: 二维/三维数组
  if (Array.isArray(data)) {
    return data
      .filter((row: any) => Array.isArray(row) && row.length >= 2)
      .map((row: any[]) => {
        const [src, pattern, tgt] = row;
        if (row.length >= 3 && pattern) {
          const regex = parseRegex(pattern);
          return {
            source: regex instanceof RegExp ? regex : src,
            target: tgt || pattern,
            regex: regex instanceof RegExp ? regex : undefined,
          };
        }
        const regex = parseRegex(src);
        return {
          source: regex instanceof RegExp ? regex : src,
          target: pattern,
          regex: regex instanceof RegExp ? regex : undefined,
        };
      });
  }

  // 对象格式 { "原文": "译文" }
  if (typeof data === 'object' && data !== null) {
    const rules: Data.TranslationRule[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string' && k && v) {
        const parsed = parseRegex(k);
        if (parsed instanceof RegExp) {
          rules.push({
            source: parsed,
            target: v,
            regex: parsed
          });
        } else {
          rules.push({
            source: k,
            target: v
          });
        }
      }
    }
  }
  throw new Error(`无法识别的文件格式`);
}

function isCollDataFormat(data: any): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  // CollData.json: { "25045": { id, name, data: [[...], ...] } }
  const firstKey = Object.keys(data)[0];
  if (!firstKey) return false;
  const firstVal = data[firstKey];
  return firstVal && Array.isArray(firstVal.data) && firstVal.data.length > 0;
}

type CollData = Record<string, {
  id: number,
  data: string|string[][],
  name: string,
  type: "script" | "trs",
  desc: string,
  lang: number,
  slang: number,
  transengine: "Bing",
  gameengine: string,
  public: number,
  createdate: number,
  updatedate: number,
  ownername: string,
  ownerid: number,
  downloadcnt: number,
  permission: {
    [key: string]: {
      permission: string[]
    }
  },
  status: string | null,
  [key: string]: any
}>

function parseCollData(data: CollData): TranslateDataNormalized {
  const rules: Data.TranslationRule[] = [];
  for (const key of Object.keys(data)) {
    const item = data[key];
    if (item.type !== "trs") continue;
    if (!item?.data || !Array.isArray(item.data)) continue;
    for (const row of item.data) {
      if (!Array.isArray(row)) continue;
      // CollData 格式: [source, pattern/regex, target]
      if (row.length >= 3 && row[0] && row[2]) {
        const src = String(row[0]).trim();
        const tgt = String(row[2]).trim();
        if (src && tgt && !src.startsWith('【') && !src.startsWith('[')) {
          // 检测是否为正则
          if (typeof row[1] === 'string' && row[1].startsWith('/') && row[1].endsWith('/')) {
            try {
              const inner = row[1].slice(1, -1);
              rules.push({
                source: new RegExp(inner, 'g'),
                target: tgt
              });
            } catch {
              rules.push({
                source: src,
                target: tgt
              });
            }
          } else {
            rules.push({
              source: src,
              target: tgt
            });
          }
        }
      }
    }
  }
  return rules;
}

// ==================== 防抖 / 节流 ====================

export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  }) as T;
}

export function throttle<T extends (...args: any[]) => void>(fn: T, interval: number): T {
  let last = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - last >= interval) {
      last = now;
      fn(...args);
    }
  }) as T;
}

// ==================== 字符串工具 ====================

export function safeJSONParse<T = any>(str: string): T|null {
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

export function timestampFileName(prefix: string, ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${prefix}_${ts}.${ext}`;
}

/**
 * Bug 1 修复：stripControlChars 增加类型检查
 */
export function stripControlChars(str: any): string {
  if (str === null || str === undefined) return '';
  if (typeof str !== 'string') {
    try { str = String(str); } catch { return ''; }
  }
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export function isResourcePath(text: any): boolean {
  if (typeof text !== 'string') return false;
  if (text.length === 0) return false;
  const resourceExts = /\.(png|jpe?g|gif|webp|svg|bmp|ico|mp3|wav|ogg|mp4|webm|avi|mov|woff2?|ttf|otf|eot)$/i;
  if (resourceExts.test(text)) return true;
  if (/^(img|image|images|audio|video|fonts?|res|resource|assets?|textures?)\//i.test(text)) return true;
  if (/^data:(image|audio|video)\//.test(text)) return true;
  if (/^ftp:\/\//.test(text)) return true;
  return false;
}

export function isValidText(text: any): text is string {
  if (typeof text !== 'string') return false;
  if (text.length === 0) return false;
  if (text.length > 500) return false;
  if (isResourcePath(text)) return false;
  if (/^\s*$/.test(text)) return false;
  return true;
}

export function download(
  data: any,
  fileName: string,
  type: "csv" | "json" | "tsv" | "txt" = "json"
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      let mimeType = ""
      let data_=null
      switch(type) {
        case "txt":
          mimeType="text/plain"
          break;
        case "csv":
          mimeType = "text/csv"
          data_ = data
            .map((row: (string | number)[]) =>
              row
                .map(cell => {
                  const str = String(cell ?? '');
                  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
                })
                .join(',')
            )
            .join('\n');
          break;
        case "tsv":
          mimeType = "text/tab-separated-values"
          data_ = data
            .map((row: (string | number)[]) => row.map(cell => String(cell ?? '').replace(/\t/g, ' ')).join('\t'))
            .join('\n');
          break;
        default:
          mimeType = "application/json"
          data_ = JSON.stringify(data, null, 2)
          break;
      }
      const blob = new Blob([data_], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve(true);
    } catch (error) {
      reject(error);
    }
  });
}


export function xhrRequest(
  url: string,
  method: "GET" | "POST" = "GET",
  headers: Record<string, string> = {},
  data ?: any
) {
  return new Promise((
    resolve: (data: any) => void,
    reject: (err: {
      status?: number;
      statusText?: string;
      error: string;
    }) => void
  ) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const key in headers) {
      xhr.setRequestHeader(key, headers[key]);
    }
    xhr.responseType = 'json';
    xhr.timeout = 10000;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        reject({
          status: xhr.status,
          statusText: xhr.statusText,
          error: xhr.response || xhr.statusText
        });
      }
    };
    xhr.onerror = () => {
      reject({ status: xhr.status, error: '网络错误（无法连接服务器）' });
    };

    xhr.ontimeout = () => {
      reject({
        status: 408,
        error: '请求超时'
      });
    };
    try {
      xhr.send(JSON.stringify(data));
    } catch (e: any) {
      reject({
        error: '序列化载荷失败：' + e.message
      });
    }
  });
}
```

## `vite.config.ts`

```ts
import { defineConfig, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'

const cssInjectedByJs = ():PluginOption => ({
  name: 'css-injected-by-js',
  apply: 'build' as const,
  enforce: 'post' as const,
  generateBundle(_: any, bundle: any) {
    const cssFiles = Object.keys(bundle).filter(key => key.endsWith('.css'))
    const jsFiles = Object.keys(bundle).filter(key => key.endsWith('.js'))

    if (cssFiles.length > 0 && jsFiles.length > 0) {
      // 1. 提取合并所有组件的 CSS 样式
      const cssContent = cssFiles.map(key => (bundle[key] as any).source).join('')

      // 2. 找到打包后的主 JS 文件
      const jsFile = bundle[jsFiles[0]] as any
      const safeCss = JSON.stringify(cssContent)
      const injectionCode = `(function(){try{var s=document.createElement('style');s.textContent=${safeCss};s.setAttribute('data-mtool','1');document.head.appendChild(s);}catch(e){}})();\n`
      jsFile.code = injectionCode + jsFile.code

      cssFiles.forEach(key => delete bundle[key])
    }
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    cssInjectedByJs()
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'index.ts',
      name: 'MToolTranslatorPlugin',
      formats: ['iife'],
    },
    rollupOptions: {
      external: [],
    },
    cssCodeSplit: false,
    assetsInlineLimit: 4096,
  }
})

```

