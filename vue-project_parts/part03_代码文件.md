# 项目代码文件（第 3 部分）

> 本文件包含 11 个文件

---

## `src/components/Stats.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue';
import translator from '../core/translator';
import aiTranslator from '../core/aiTranslator';
import config from '../config';

const stats = computed(() => {
  try {
    return translator.stats;
  } catch {
    return null;
  }
});

const aiPendingCount = computed(() => {
  try {
    return aiTranslator.pendingCount;
  } catch {
    return 0;
  }
});

const formatNumber = (n: any): string => {
  const num = Number(n) || 0;
  return num.toLocaleString();
};

const formatPercent = (n: any): string => {
  const num = Number(n) || 0;
  return `${num}%`;
};
</script>

<template>
  <div
    class="stats-panel"
    v-if="stats"
  >
    <!-- 总览卡片 -->
    <div class="stats-grid">
      <div class="stat-card primary">
        <div class="stat-value">{{ formatNumber(stats.rules) }}</div>
        <div class="stat-label">总规则数</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">{{ formatPercent(stats.cacheHitRate) }}</div>
        <div class="stat-label">缓存命中率</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-value">{{ formatNumber(stats.cacheSize) }}</div>
        <div class="stat-label">缓存条目</div>
      </div>
      <div class="stat-card info">
        <div class="stat-value">{{ formatNumber(stats.aiLearnedCount) }}</div>
        <div class="stat-label">AI 学习</div>
      </div>
    </div>

    <!-- 详细表格 -->
    <div class="stats-section">
      <div class="section-title">详细统计</div>
      <table class="stats-table">
        <tbody>
          <tr>
            <td>精确规则</td>
            <td>{{ formatNumber(stats.exactRules) }}</td>
          </tr>
          <tr>
            <td>正则规则</td>
            <td>{{ formatNumber(stats.regexRules) }}</td>
          </tr>
          <tr>
            <td>默认规则</td>
            <td>{{ formatNumber(stats.defaultRules) }}</td>
          </tr>
          <tr>
            <td>用户规则</td>
            <td>{{ formatNumber(stats.userRules) }}</td>
          </tr>
          <tr>
            <td>缓存总查询</td>
            <td>{{ formatNumber(stats.cacheTotal) }}</td>
          </tr>
          <tr>
            <td>忽略条目</td>
            <td>{{ formatNumber(stats.ignoreSize) }}</td>
          </tr>
          <tr>
            <td>Bloom 条目</td>
            <td>{{ formatNumber(stats.bloomSize) }} ({{ formatNumber(stats.bloomBytes) }}B)</td>
          </tr>
          <tr v-if="stats.preTranslated">
            <td>预翻译</td>
            <td class="status-ok">✓ 已完成</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- AI 统计 -->
    <div
      class="stats-section"
      v-if="config.user.enableAI.userConfig"
    >
      <div class="section-title">🤖 AI 翻译</div>
      <table class="stats-table">
        <tbody>
          <tr>
            <td>AI 待处理</td>
            <td>{{ formatNumber(aiPendingCount) }}</td>
          </tr>
          <tr>
            <td>AI Fix 规则</td>
            <td>{{ formatNumber(stats.aiFixRules) }}</td>
          </tr>
          <tr>
            <td>AI Fix 命中</td>
            <td>{{ formatNumber(stats.aiFixHits) }}</td>
          </tr>
        </tbody>
      </table>
      <div
        class="last-fix"
        v-if="stats.aiFixLastFix"
      >
        <small>最近修正: {{ stats.aiFixLastFix }}</small>
      </div>
    </div>

    <!-- 压缩统计 -->
    <div
      class="stats-section"
      v-if="stats.compactStats"
    >
      <div class="section-title">🗜 压缩统计</div>
      <table class="stats-table">
        <tbody>
          <tr>
            <td>原始规则</td>
            <td>{{ formatNumber(stats.compactStats.originalCount) }}</td>
          </tr>
          <tr>
            <td>压缩后</td>
            <td>{{ formatNumber(stats.compactStats.compactedCount) }}</td>
          </tr>
          <tr>
            <td>压缩率</td>
            <td>{{ formatPercent(stats.compactStats.compressionRatio) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div
    class="stats-panel"
    v-else
  >
    <p class="loading">加载中...</p>
  </div>
</template>

<style scoped>
.stats-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.stat-card {
  padding: 10px;
  border-radius: 8px;
  text-align: center;
  color: #fff;
}

.stat-card.primary {
  background: linear-gradient(135deg, #197dea, #1559b3);
}

.stat-card.success {
  background: linear-gradient(135deg, #2ecc71, #27ae60);
}

.stat-card.warning {
  background: linear-gradient(135deg, #f39c12, #e67e22);
}

.stat-card.info {
  background: linear-gradient(135deg, #9b59b6, #8e44ad);
}

.stat-value {
  font-size: 20px;
  font-weight: bold;
}

.stat-label {
  font-size: 10px;
  opacity: 0.9;
  margin-top: 2px;
}

.stats-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 10px;
}

.section-title {
  font-size: 12px;
  font-weight: bold;
  color: #555;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid #eee;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.stats-table td {
  padding: 4px 6px;
  border-bottom: 1px solid #f0f0f0;
}

.stats-table td:first-child {
  color: #666;
}

.stats-table td:last-child {
  text-align: right;
  font-weight: bold;
  color: #333;
}

.status-ok {
  color: #2ecc71 !important;
}

.last-fix {
  margin-top: 6px;
  padding: 4px 8px;
  background: #e8f8f0;
  border-radius: 4px;
  font-size: 10px;
  color: #27ae60;
}

.loading {
  text-align: center;
  color: #999;
  padding: 20px;
}
</style>
```

## `src/config.ts`

```ts
import { reactive } from 'vue';
import { EngineType, Language } from './typings/enum';
import { safeJSONParse } from './utils';

export const Lang: Record<Language, string> = {
  [Language.en]: 'English',
  [Language.zh_CN]: '简体中文',
  [Language.zh_TW]: '繁體中文',
  [Language.ja]: '日本語',
  [Language.ko]: '한국어',
};

const defaultEngines: Record<EngineType, boolean> = {
  [EngineType.RPGMaker]: true,
  [EngineType.PixiJS]: true,
  [EngineType.Cocos2d]: true,
  [EngineType.Canvas2D]: true,
  [EngineType.Bitmap]: true,
  [EngineType.Phaser]: true,
  [EngineType.XHR]: true,
  [EngineType.WebSocket]: false,
  [EngineType.Fetch]: false
};

interface ConfigField<T> {
  description: string;
  default: T;
  userConfig: T;
}

class ConfigFieldStore<T> implements ConfigField<T> {
  description: string;
  default: T;
  userConfig: T;

  constructor(description: string, defaultVal: T, userConfig: T) {
    this.description = description;
    this.default = defaultVal;
    this.userConfig = userConfig;
  }
}

class ConfigStore {
  maxCacheSize = 10000;
  maxLogCount = 50;
  maxReplaceCount = 1;
  debug = false;
  defaultSkipRules: RegExp[] = [
    /^[-+]?[\d０-９:\-\s]+(?:\.[\d]+)?[%￥\$€£¥¢GＧ]?(?:\/[\d０-９]+)?$/,
    /^[A-Za-z\s\.]$/,
    /^<.+?>$/,
    /^[\%\^&\*\(\)_\+-=\[\]{};'\:"\\\|,\.\<\>\/\?`~\!@#\$。，、；：？\！…—～（）｛｝【】《》￥\$€£¥¢]+$/,
    /^[\s\r\n\t\v\f\u00A0\u1680\u180e\u2000-\u200b\u202f\u205f\u3000\uFEFF]+$/,
    /^\s*(?:O(?:FF|N)|[HMT]P)\s*$/,
  ];

  filterRule = /[\\]+(?:(?:u001b)?C|c|v|S[AEM]|N|P|G)+(?:\[[(?:\d(?:-nb)?|double)]+\])?/g;

  public user = reactive({
    fileName: new ConfigFieldStore<string>(
      '翻译数据文件名',
      'default.json',
      ''
    ),
    autoLoad: new ConfigFieldStore<boolean>(
      '启动时自动加载缓存',
      true,
      true
    ),
    transengine: new ConfigFieldStore<string>(
      'MTool社区翻译引擎名',
      'Bing',
      ''
    ),
    translatorName: new ConfigFieldStore<string>(
      'MTool社区翻译修正名称',
      '常规通用性修正',
      ''
    ),
    targetLang: new ConfigFieldStore<Language>(
      '目标语言',
      Language.zh_CN,
      Language.zh_CN
    ),
    AI_BASE_URL: new ConfigFieldStore<string>(
      'AI API 基础 URL',
      'https://api.deepseek.com',
      ''
    ),
    AI_KEY: new ConfigFieldStore<string>(
      'AI API 密钥',
      '',
      ''
    ),
    model: new ConfigFieldStore<string>(
      'AI 模型名称',
      'deepseek-v4-flash',
      ''
    ),
    enableAI: new ConfigFieldStore<boolean>(
      '启用 AI 翻译回退',
      false,
      false
    ),
    aiTriggerThreshold: new ConfigFieldStore<number>(
      'AI翻译触发阈值',
      5,
      5
    ),
    engines: new ConfigFieldStore<Record<EngineType, boolean>>(
      '翻译引擎开关',
      defaultEngines,
      defaultEngines
    ),
    exportFormat: new ConfigFieldStore<"json" | "csv">(
      '导出文件格式',
      'json',
      'json'
    ),
    maxReplaceCount: new ConfigFieldStore<number>(
      '单次翻译最大替换次数',
      1,
      1
    ),
    maxLogCount: new ConfigFieldStore<number>(
      '最大日志条数',
      50,
      50
    ),
    hookWebSocket: new ConfigFieldStore<boolean>(
      '拦截 MTool AI 翻译 WebSocket',
      true,
      true
    ),
    wsTargetURL: new ConfigFieldStore<string>(
      'WS 目标地址',
      '127.0.0.1:64002',
      ''
    ),
    wsEnableRequestFix: new ConfigFieldStore<boolean>(
      '拦截请求→本地翻译',
      true,
      true
    ),
    wsEnableResponseFix: new ConfigFieldStore<boolean>(
      '拦截响应→AI译文后修正',
      true,
      true,
    ),
    aiFixExportFormat: new ConfigFieldStore<"json" | "csv">(
      'AI修正规则导出格式',
      'json',
      'json',
    ),
    mootHookEnabled: new ConfigFieldStore<boolean>(
      '启用 Moot wslikecmd HTTP 拦截',
      true,
      true,
    ),
    mootApiUrl: new ConfigFieldStore<string>(
      'Moot API 地址',
      'http://127.0.0.1:64002/wslikecmd',
      'http://127.0.0.1:64002/wslikecmd'
    ),
    mootInterceptRequest: new ConfigFieldStore<boolean>(
      '请求阶段本地翻译拦截',
      true,
      true,
    ),
    mootProcessResponse: new ConfigFieldStore<boolean>(
      '响应阶段 AI 译文后修正',
      true,
      true,
    ),
    mootDebug: new ConfigFieldStore<boolean>(
      '调试模式',
      false,
      false
    ),
    maxCacheSize: new ConfigFieldStore<number>(
      '最大缓存大小',
      30000,
      30000
    )
  });

  // 获取完整用户配置快照
  snapshot(): Record<string, any> {
    const result: Record<string, any> = {};
    Object.keys(this.user).forEach(key => {
      const field = (this.user as any)[key];
      result[key] = field?.userConfig ?? field;
    });
    return result;
  }

  // 获取引擎开关（合并默认值）
  getEngines(): Record<EngineType, boolean> {
    const userEngines = this.user.engines.userConfig || this.user.engines.default;
    return userEngines;
  }

  isEngineEnabled(engine: EngineType): boolean {
    return this.getEngines()[engine] ?? true;
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem('LocalTranslatorUserConfig');
      if (raw) {
        const parsed = safeJSONParse(raw);
        // 逐字段赋值，保持 reactive 代理
        for (const [key, field] of Object.entries(parsed)) {
          const target = (this.user as any)[key];
          if (target && typeof target === 'object' && 'userConfig' in target) {
            target.userConfig = field;
          }
        }
      }
    } catch (e) {
      console.warn('[MToolTranslatorPlugin] 恢复用户配置失败:', e);
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem('LocalTranslatorUserConfig', JSON.stringify(this.snapshot()));
    } catch (e) {
      console.warn('[MToolTranslatorPlugin] 保存用户配置失败:', e);
    }
  }

  // ---- 默认翻译规则 ----
  defaultRules: Record<string, string> = {
    '/Text Speed/': '文本播放速度',
    '/Settings|設定/': '设置',
    '/unseen text/': '未读文本',
    '常時ダッシュ': '保持冲刺状态',
    '/アイテム|ｱｲﾃﾑ/': '道具',
    '/ロード|load/': '加载',
    '/セーブ|save/': '保存',
    'コマンド記憶': '指令记忆',
    '/タッチ\s*UI/': '触摸UI',
    'home': '家',
    'ニューゲーム': '新游戏',
    '/コンティニュー|つづきから/': '继续游戏',
    'ゲーム終了': '结束游戏',
    'オプション': '选项',
    '/タイトル(?:画面)?に戻[する]|タイトルへ/': '返回标题画面',
    'ピクチャ': '图片',
    '/[お]?兄(?:さん|を)|おにい/': '哥哥',
    '/[お]?姉(?:さん)?/': '姐姐',
    '電車': '电车',
    '経験': '经验',
    'クイックメニュー': '快捷菜单',
    'どのファイルを加载しますか？': '要加载哪个存档？',
    'ボイス': '语音',
    'ファイル': '存档',
    '実績': '成就',
    'ステータス': '状态',
    'スキル': '技能',
  };
}

export const config = new ConfigStore();
config.loadFromStorage();

export default config;
```

## `src/core/aiFixRules.ts`

```ts
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

import { getFileType, parseDelimited, parseRegex, parseXLSX, safeJSONParse } from '../utils';
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
        const rule = parseRuleItem({ ...value, aaa: (value as any).aaa || key });
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
    const d = new Date();
    const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const arr = this.rules.map(r => ({
      aaa: r.aaa instanceof RegExp ? `/${r.aaa.source}/${r.aaa.flags}` : r.aaa,
      bbb: r.bbb instanceof RegExp ? `/${r.bbb.source}/${r.bbb.flags}` : (r.bbb || ''),
      ccc: r.ccc,
    }));
    return {
      data: arr,
      fileName: `AIFixRules_${ts}.json`,
    };
  }

  exportCSV(): {
    data: string[][];
    fileName: string
  } {
    const d = new Date();
    const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
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
      fileName: `AIFixRules_${ts}.csv`
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
```

## `src/core/aiTranslator.ts`

```ts
import config from '../config';
import cache from './cache';
import logger, { LogLevel } from './logger';

const pendingRequests = new Map<string, Promise<string>>();
const requestQueue: Array<() => void> = [];
let activeRequests = 0;
const MAX_CONCURRENT = 3;
const DEFAULT_SYSTEM_PROMPT = `你是一个专业的游戏本地化翻译引擎。请将用户输入的文本翻译为{target_lang}。

规则：
1. 仅输出翻译结果，不要任何解释、注释或额外文本
2. 保持原文的换行符、占位符（如 %s、{0}、\\n）不变
3. 保持原文的标点符号风格
4. 专有名词（人名、地名、技能名）尽量音译或保留原文
5. 如果原文已经是目标语言，原样返回
6. 每次输入可能包含多行文本，逐行翻译，保持行数一致`;

class AITranslator {
  private baseURL: string = '';
  private apiKey: string = '';
  private model: string = '';
  private enabled: boolean = false;

  updateConfig() {
    this.baseURL = config.user.AI_BASE_URL.userConfig || config.user.AI_BASE_URL.default;
    this.apiKey = config.user.AI_KEY.userConfig || config.user.AI_KEY.default;
    this.model = config.user.model.userConfig || config.user.model.default;
    this.enabled = config.user.enableAI.userConfig && !!this.apiKey && !!this.baseURL;
  }

  get isAvailable(): boolean {
    return this.enabled && !!this.apiKey && !!this.baseURL;
  }

  async translate(
    text: string,
    options: Options.AITranslateOptions = {}
  ): Promise<string> {
    if (!this.isAvailable) return text;
    if (!text || text.trim().length === 0) return text;

    const cacheKey = `${options.targetLang || config.user.targetLang.userConfig}:${text}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey)!;

    const promise = this._doTranslate(text, options);
    pendingRequests.set(cacheKey, promise);

    try {
      const result = await promise;
      cache.set(cacheKey, result);
      return result;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  }

  async translateBatch(
    texts: string[],
    options: Options.AITranslateOptions = {}
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    if (!this.isAvailable || texts.length === 0) return results;

    const uncached: string[] = [];
    const targetLang = options.targetLang || config.user.targetLang.userConfig || 'zh-CN';

    for (const t of texts) {
      const cacheKey = `${targetLang}:${t}`;
      if (cache.has(cacheKey)) {
        results.set(t, cache.get(cacheKey)!);
      } else {
        uncached.push(t);
      }
    }

    if (uncached.length === 0) return results;

    const BATCH_SIZE = 20;
    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE);
      const batchResults = await this._translateBatchInternal(batch, options);
      for (const [k, v] of batchResults) {
        results.set(k, v);
        const cacheKey = `${targetLang}:${k}`;
        cache.set(cacheKey, v);
      }
    }

    return results;
  }

  get pendingCount() {
    return pendingRequests.size;
  }

  // ==================== 私有方法 ====================

  private async _doTranslate(
    text: string,
    options: Options.AITranslateOptions
  ): Promise<string> {
    return this._withRetry(async () => {
      const targetLang = options.targetLang || config.user.targetLang.userConfig || 'zh-CN';
      const sourceLang = options.sourceLang || 'ja';
      const systemPrompt = (options.systemPrompt || DEFAULT_SYSTEM_PROMPT).replace(
        '{target_lang}', String(targetLang)
      );

      const controller = new AbortController();
      const timeoutMs = options.timeout || 30000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: `Source language: ${sourceLang}\nTarget language: ${targetLang}\n\nTranslate:\n${text}`
              },
            ],
            temperature: options.options?.temperature || 0.7,
            max_tokens: options.options?.maxTokens || 2048,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`AI API 错误 [${response.status}]: ${await response.text()}`);
        }

        const data = await response.json() as API.AIResponse;
        return data.choices?.[0]?.message?.content?.trim() || text;
      } finally {
        clearTimeout(timeout);
      }
    }, options.maxRetries || 3);
  }

  private async _translateBatchInternal(
    texts: string[],
    options: Options.AITranslateOptions
  ): Promise<Map<string, string>> {
    return new Promise((resolve) => {
      const task = async () => {
        activeRequests++;
        try {
          const targetLang = options.targetLang || config.user.targetLang.userConfig || 'zh-CN';
          const sourceLang = options.sourceLang || 'ja';
          const combinedText = texts.map((t, i) => `[${i}] ${t}`).join('\n');

          const controller = new AbortController();
          const timeoutMs = options.timeout || 60000;
          const timeout = setTimeout(() => controller.abort(), timeoutMs);

          try {
            const response = await fetch(`${this.baseURL}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
              },
              body: JSON.stringify({
                model: this.model,
                messages: [
                  {
                    role: 'system',
                    content: `你是一个游戏本地化翻译引擎。将以下带编号的文本逐条翻译为${targetLang}。规则：仅输出翻译结果，格式为 [编号] 翻译文本，每行一条。保持换行符和占位符不变。`
                  },
                  {
                    role: 'user',
                    content: `Source: ${sourceLang}\n\n${combinedText}`
                  },
                ],
                temperature: options.options?.temperature || 0.7,
                max_tokens: options.options?.maxTokens || 2048,
              }),
              signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) throw new Error(`AI Batch API 错误 [${response.status}]`);

            const data = await response.json() as API.AIResponse;
            const content = data.choices?.[0]?.message?.content || '';
            const results = new Map<string, string>();

            for (const line of content.split('\n')) {
              const m = line.match(/^\[(\d+)\]\s*(.+)$/);
              if (m) {
                const idx = parseInt(m[1]);
                if (idx >= 0 && idx < texts.length) {
                  results.set(texts[idx], m[2].trim());
                }
              }
            }

            for (const t of texts) {
              if (!results.has(t)) results.set(t, t);
            }

            resolve(results);
          } finally {
            clearTimeout(timeout);
          }
        } catch (e: any) {
          logger.addLog(`AI 批量翻译失败: ${e.message}`, LogLevel.ERROR);
          const fallback = new Map<string, string>();
          texts.forEach(t => fallback.set(t, t));
          resolve(fallback);
        } finally {
          activeRequests--;
          const next = requestQueue.shift();
          if (next) next();
        }
      };

      if (activeRequests >= MAX_CONCURRENT) {
        requestQueue.push(() => task());
      } else {
        task();
      }
    });
  }

  private async _withRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (e: any) {
        lastError = e;
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          logger.addLog(`AI 翻译重试 (${attempt + 1}/${maxRetries})，等待 ${delay}ms`, LogLevel.WARNING);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastError || new Error('AI 翻译失败');
  }
}

const aiTranslator = new AITranslator();
export default aiTranslator;
```

## `src/core/bloomFilter.ts`

```ts
/**
 * TinyBloom — 轻量级 Bloom Filter
 *
 * 用途：在翻译引擎中做 O(1) 前置过滤，
 *       快速判断文本"是否可能存在于"规则集中。
 *
 * 特点：
 *   - 2 个独立哈希函数（FNV-1a + DJB2）
 *   - 3 次探针（probe）
 *   - 默认 2048 个 uint32 = 8KB 内存
 *   - 误判率约 1~3%（仅作为前置过滤，可接受）
 *   - 确定"不存在"时 100% 准确
 */

export class TinyBloom {
  private bits: Uint32Array;
  private size: number;
  private _count: number = 0;

  constructor(size?: number) {
    this.size = size || 2048;
    this.bits = new Uint32Array(this.size);
  }

  add(str: string): void {
    if (!str || typeof str !== 'string') return;
    const h1 = TinyBloom._hash1(str);
    const h2 = TinyBloom._hash2(str);
    for (let i = 0; i < 3; i++) {
      const idx = ((h1 + i * h2) >>> 0) % this.size;
      const bitPos = ((h1 + i * h2 * 7) >>> 0) & 31;
      this.bits[idx] |= (1 << bitPos);
    }
    this._count++;
  }

  addAll(strings: Iterable<string>): void {
    if (!strings) return;
    for (const s of strings) this.add(s);
  }

  /**
   * 判断字符串"可能存在于"集合中
   * @returns false = 一定不存在（安全跳过）
   *          true  = 可能存在（需进一步精确查询）
   */
  mightContain(str: string): boolean {
    if (!str || typeof str !== 'string') return false;
    const h1 = TinyBloom._hash1(str);
    const h2 = TinyBloom._hash2(str);
    for (let i = 0; i < 3; i++) {
      const idx = ((h1 + i * h2) >>> 0) % this.size;
      const bitPos = ((h1 + i * h2 * 7) >>> 0) & 31;
      if (!(this.bits[idx] & (1 << bitPos))) {
        return false;
      }
    }
    return true;
  }

  clear(): void {
    this.bits.fill(0);
    this._count = 0;
  }

  get count(): number {
    return this._count;
  }

  get byteSize(): number {
    return this.bits.byteLength;
  }

  // ========== FNV-1a 32-bit ==========
  private static _hash1(s: string): number {
    let h = (2166136261 >>> 0);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      // Math.imul 确保 32-bit 溢出乘法
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // ========== DJB2 32-bit ==========
  private static _hash2(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    }
    return h >>> 0;
  }
}
```

## `src/core/cache.ts`

```ts
import config from '../config';
import { debounce, safeJSONParse } from '../utils';

type lastCache = {
  text: string;
  result: string;
}

class TranslatorCache {
  private cache: Map<string, string> = new Map();
  private learnedKeys: Set<string> = new Set();
  ignoretext: Set<string> = new Set();
  private maxSize: number;
  private last1: lastCache | null = null;
  private last2: lastCache | null = null;
  private last3: lastCache | null = null;

  stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    ignoreHits: 0,
    lruEvictions: 0,
    learnedEntries: 0,
  };

  constructor(maxCacheSize?: number) {
    this.maxSize = maxCacheSize || config.user.maxCacheSize.userConfig || 20000;
  }

  // ==================== 快速命中（3 级 LRU）====================

  private quickHit(text: string): string | undefined {
    if (this.last1 && (this.last1.text === text || this.last1.result === text)) {
      return this.last1.result;
    }
    if (this.last2 && (this.last2.text === text || this.last2.result === text)) {
      const tmp = this.last2;
      this.last2 = this.last1;
      this.last1 = tmp;
      return tmp.result;
    }
    if (this.last3 && (this.last3.text === text || this.last3.result === text)) {
      const tmp = this.last3;
      this.last3 = this.last2;
      this.last2 = this.last1;
      this.last1 = tmp;
      return tmp.result;
    }
    return undefined;
  }

  private quickSet(text: string, result: string) {
    this.last3 = this.last2;
    this.last2 = this.last1;
    this.last1 = { text, result };
  }

  // ==================== 公开 API ====================

  get(key: string): string | undefined {
    if (typeof key !== 'string') return undefined;
    const quick = this.quickHit(key);
    if (quick !== undefined) {
      this.stats.hits++;
      return quick;
    }
    const val = this.cache.get(key);
    if (val !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, val);
      this.quickSet(key, val);
      this.stats.hits++;
      return val;
    }
    this.stats.misses++;
    return undefined;
  }

  set(key: string, value: string, markLearned: boolean = false) {
    if (typeof key !== 'string' || typeof value !== 'string') return;
    if (key === value) return;

    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
      this.learnedKeys.delete(oldestKey);
      this.stats.lruEvictions++;
    }
    this.cache.set(key, value);
    this.quickSet(key, value);
    this.stats.sets++;

    if (markLearned) {
      this.learnedKeys.add(key);
      this.stats.learnedEntries = this.learnedKeys.size;
    }
  }

  markLearned(key: string) {
    if (this.cache.has(key)) {
      this.learnedKeys.add(key);
      this.stats.learnedEntries = this.learnedKeys.size;
    }
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  isIgnored(text: string): boolean {
    if (typeof text !== 'string') return false;
    if (this.ignoretext.has(text)) {
      this.stats.ignoreHits++;
      return true;
    }
    return false;
  }

  addIgnore(text: string) {
    if (typeof text === 'string') {
      this.ignoretext.add(text);
    }
  }

  removeIgnore(text: string) {
    this.ignoretext.delete(text);
  }

  clear() {
    this.cache.clear();
    this.learnedKeys.clear();
    this.ignoretext.clear();
    this.last1 = null;
    this.last2 = null;
    this.last3 = null;
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.sets = 0;
    this.stats.ignoreHits = 0;
    this.stats.learnedEntries = 0;
  }

  get size(): number {
    return this.cache.size;
  }

  get ignoreSize(): number {
    return this.ignoretext.size;
  }

  get learnedSize(): number {
    return this.learnedKeys.size;
  }

  // ==================== 导出 / 导入 ====================

  exportJson(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [k, v] of this.cache) {
      obj[k] = v;
    }
    return obj;
  }

  exportEntries(): IterableIterator<[string, string]> {
    return this.cache.entries();
  }

  exportLearnedEntries(): Array<[string, string]> {
    const result: Array<[string, string]> = [];
    for (const key of this.learnedKeys) {
      const val = this.cache.get(key);
      if (val !== undefined) {
        result.push([key, val]);
      }
    }
    return result;
  }

  importJson(data: Record<string, string>) {
    this.clear();
    for (const [k, v] of Object.entries(data)) {
      this.set(k, v);
    }
  }

  // ==================== 持久化 ====================
  saveToStorage = debounce((key: string) => {
    try {
      const data = this.exportJson();
      const trimmed = JSON.stringify(Object.fromEntries(
        Object.entries(data).filter(([k, v]) => k && v)
      ));
      if (trimmed.length > 4_000_000) {
        console.warn('[Cache] 缓存数据过大，仅保存最近 10000 条');
        const trimmed: Record<string, string> = {};
        let count = 0;
        for (const [k, v] of this.cache) {
          if (count++ >= 10000) break;
          trimmed[k] = v;
        }
        localStorage.setItem(key, JSON.stringify(trimmed));
      } else {
        localStorage.setItem(key, trimmed);
      }
    } catch (e) {
      console.warn('[Cache] 保存失败:', e);
    }
  }, 2000);

  loadFromStorage(key: string) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = safeJSONParse(raw);
      if (Array.isArray(data)) {
        data.forEach(([k, v]: [string, string]) => this.set(k, v));
      } else if (typeof data === 'object') {
        Object.entries(data).forEach(([k, v]) => this.set(k, String(v)));
      }
    } catch (e) {
      console.warn('[Cache] 加载失败:', e);
    }
  }

  get hitRate(): { hitRate: number; total: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      hitRate: total > 0 ? +(this.stats.hits / total * 100).toFixed(2) : 0,
      total,
    };
  }
}

const cache = new TranslatorCache();
export default cache;
```

## `src/core/hookManager.ts`

```ts
/**
 * hookManager.ts — 统一引擎 Hook 安装/卸载管理
 *
 * 修复（Bug 修复）：
 *  - 引擎开关关闭时，调用对应的 uninstallHook 还原原型方法
 *  - 开关状态变更时动态安装/卸载（无需刷新页面）
 *  - 增加 console.log 调试输出
 */
import logger, { LogLevel } from './logger';
import {
  hookBitmap,
  hookCanvas,
  hookRPGMaker,
  hookPixiJS,
  hookCocos,
  unhookBitmap,
  unhookCanvas,
  unhookRPGMaker,
  unhookPixiJS,
  unhookCocos,
  hookPhaser,
  unhookPhaser,
} from './hooks/engine';
import { hookXHR, unhookXHR, hookFetch, unhookFetch } from './hooks/network';
import { EngineType } from '../typings/enum';
import { hookPrototype } from './hooks/utils';
import config from '../config';

const installedEngines = new Set<string>();

export function getInstalledEngines(): string[] {
  return Array.from(installedEngines);
}

export function isEngineInstalled(engine: string): boolean {
  return installedEngines.has(engine);
}

export function installEngineHooks(
  callback: (text: string) => any,
  cfg: Record<EngineType, boolean>,
  options?: {
    xhrOptions?: Options.XHRHookOptions;
  }
) {
  if (config.debug) {
    console.log('[MToolTranslatorPlugin][HookManager] 安装引擎 Hooks', cfg);
  }

  // ---- Bitmap ----
  if (cfg[EngineType.Bitmap]) {
    if (!isEngineInstalled('Bitmap')) {
      hookBitmap(callback);
      installedEngines.add('Bitmap');
    }
  } else {
    if (isEngineInstalled('Bitmap')) {
      unhookBitmap();
      installedEngines.delete('Bitmap');
    }
  }

  // ---- Canvas 2D ----
  if (cfg[EngineType.Canvas2D]) {
    if (!isEngineInstalled('Canvas2D')) {
      hookCanvas(callback);
      installedEngines.add('Canvas2D');
    }
  } else {
    if (isEngineInstalled('Canvas2D')) {
      unhookCanvas();
      installedEngines.delete('Canvas2D');
    }
  }

  // ---- RPG Maker ----
  if (cfg[EngineType.RPGMaker]) {
    if (!isEngineInstalled('RPGMaker')) {
      hookRPGMaker(callback);
      installedEngines.add('RPGMaker');
    }
  } else {
    if (isEngineInstalled('RPGMaker')) {
      unhookRPGMaker();
      installedEngines.delete('RPGMaker');
    }
  }

  // ---- PixiJS ----
  if (cfg[EngineType.PixiJS]) {
    if (!isEngineInstalled('PixiJS')) {
      hookPixiJS(callback);
      installedEngines.add('PixiJS');
    }
  } else {
    if (isEngineInstalled('PixiJS')) {
      unhookPixiJS();
      installedEngines.delete('PixiJS');
    }
  }

  // ---- Cocos2d ----
  if (cfg[EngineType.Cocos2d]) {
    if (!isEngineInstalled('Cocos2d')) {
      hookCocos(callback);
      installedEngines.add('Cocos2d');
    }
  } else {
    if (isEngineInstalled('Cocos2d')) {
      unhookCocos();
      installedEngines.delete('Cocos2d');
    }
  }

  if (cfg[EngineType.Phaser]) {
    if (!isEngineInstalled('Phaser')) {
      hookPhaser(callback);
      installedEngines.add('Phaser');
    }
  } else {
    if (isEngineInstalled('Phaser')) {
      unhookPhaser();
      installedEngines.delete('Phaser');
    }
  }

  // ---- XHR ----
  if (cfg[EngineType.XHR]) {
    if (!isEngineInstalled('XHR')) {
      hookXHR(
        options?.xhrOptions || {},
        callback
      );
      installedEngines.add('XHR');
    }
  } else {
    if (isEngineInstalled('XHR')) {
      unhookXHR();
      installedEngines.delete('XHR');
    }
  }

  // ---- Fetch ----
  if (cfg[EngineType.Fetch]) {
    if (!isEngineInstalled('Fetch')) {
      hookFetch({
        jsonOnly: true,
        transformResponse: (body: any, _) => {
          // 对 JSON 响应中的字符串字段做翻译
          if (typeof body === 'string') {
            const result = callback(body);
            if (Array.isArray(result) && typeof result[0] === 'string') {
              return result[0];
            }
            return result;
          }
          if (body && typeof body === 'object') {
            const translated: any = Array.isArray(body) ? [] : {};
            const processObj = (obj: any, target: any) => {
              for (const key of Object.keys(obj)) {
                const val = obj[key];
                if (typeof val === 'string' && val.length >= 2) {
                  const newArgs = callback(val);
                  target[key] = Array.isArray(newArgs) ? newArgs[0] : newArgs;
                } else if (typeof val === 'object' && val !== null) {
                  target[key] = Array.isArray(val) ? [] : {};
                  processObj(val, target[key]);
                } else {
                  target[key] = val;
                }
              }
            };
            processObj(body, translated);
            return translated;
          }
          return body;
        },
      });
      installedEngines.add('Fetch');
    }
  } else {
    if (isEngineInstalled('Fetch')) {
      unhookFetch();
      installedEngines.delete('Fetch');
    }
  }

  // ---- WebSocket ----
  if (cfg[EngineType.WebSocket]) {
    if (!isEngineInstalled('WebSocket')) {
      // WebSocket 由 translator 内部的 mootHook/wsHook 管理
      // 这里仅记录状态
      installedEngines.add('WebSocket');
      console.log('[MToolTranslatorPlugin][HookManager] WebSocket 由 Moot/WS 模块管理');
    }
  } else {
    installedEngines.delete('WebSocket');
  }
  if (config.debug) {
    console.log(`[MToolTranslatorPlugin][HookManager] 当前已安装: ${getInstalledEngines().join(', ') || '无'}`);
  }
}

export function uninstallAllEngineHooks(): void {
  if (config.debug) {
    console.log('[MToolTranslatorPlugin][HookManager] 卸载所有引擎 Hooks');
  }
  unhookBitmap();
  unhookCanvas();
  unhookRPGMaker();
  unhookPixiJS();
  unhookCocos();
  unhookPhaser();
  unhookXHR();
  unhookFetch();
  installedEngines.clear();
  logger.addLog('所有引擎 Hook 已卸载并还原', LogLevel.INFO);
}



// ==================== RPG Maker 预翻译 ====================

export function hookRPGMakerPreTranslate(
  translator: {
    translateSync: (text: string) => string
  },
  translateFn?: (...args: any[]) => any
): void {
  if (typeof window.DataManager === 'undefined') {
    logger.addLog('DataManager 不可用，预翻译 Hook 跳过', LogLevel.WARNING);
    return;
  }

  const fn = translateFn || ((text: string) => translator.translateSync(text));

  hookPrototype(
    'DataManager',
    'onLoad',
    function (this: any, _, ...args: any[]) {
      const object = args[0];
      if (object && typeof object === 'object') {
        const translated = deepTranslateInPlace(object, fn);
        if (Array.isArray(object) && Array.isArray(translated)) {
          object.length = 0;
          object.push(...translated);
        } else if (!Array.isArray(object)) {
          Object.keys(object).forEach(k => delete object[k]);
          Object.assign(object, translated);
        }
      }
      args[0] = object;
      return args;
    }
  );

  console.log('[MToolTranslatorPlugin][HookManager] ✅ RPG Maker 预翻译 Hook 已安装');
  logger.addLog('RPG Maker 预翻译 Hook 已安装', LogLevel.SUCCESS);
}

// ==================== 深度翻译（原地修改 + 返回值）====================

function deepTranslateInPlace(obj: any, translateFn: (s: string) => string): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    if (obj.length < 2) return obj;
    if (/^[\d０-９\s\-+\.\/]+$/.test(obj)) return obj;
    if (obj.startsWith('\x1b') || obj.startsWith('\u001b')) return obj;
    const result = translateFn(obj);
    return result || obj;
  }

  if (Array.isArray(obj)) {
    const newArr: any[] = [];
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i];
      if (typeof item === 'string') {
        if (item.length >= 2 && !/^[\d０-９\s\-+\.\/]+$/.test(item) && !item.startsWith('\x1b')) {
          const translated = translateFn(item);
          newArr.push(translated || item);
        } else {
          newArr.push(item);
        }
      } else if (typeof item === 'object') {
        newArr.push(deepTranslateInPlace(item, translateFn));
      } else {
        newArr.push(item);
      }
    }
    return newArr;
  }

  if (typeof obj === 'object') {
    const newObj: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const val = obj[key];
      if (typeof val === 'string') {
        if (val.length >= 2 && !/^[\d０-９\s\-+\.\/]+$/.test(val) && !val.startsWith('\x1b')) {
          const translated = translateFn(val);
          newObj[key] = translated || val;
        } else {
          newObj[key] = val;
        }
      } else if (typeof val === 'object' && val !== null) {
        newObj[key] = deepTranslateInPlace(val, translateFn);
      } else {
        newObj[key] = val;
      }
    }
    return newObj;
  }

  return obj;
}

// ==================== RPG Maker 文本扫描 ====================

export function scanRPGMakerDialog(callback: (texts: Set<string>) => void): void {
  if (typeof window.DataManager === 'undefined') {
    logger.addLog('DataManager 不可用，跳过文本扫描', LogLevel.WARNING);
    callback(new Set());
    return;
  }

  const texts = new Set<string>();

  const tryScan = () => {
    if (typeof window.$data === 'undefined' || !window.$data) {
      setTimeout(tryScan, 500);
      return;
    }

    for (const key of Object.keys(window.$data)) {
      const data = (window.$data as any)[key];
      if (data) {
        collectTexts(data, texts);
      }
    }

    logger.addLog(`RPG Maker 文本扫描完成: ${texts.size} 条唯一文本`, LogLevel.INFO);
    callback(texts);
  };

  setTimeout(tryScan, 1000);
}

// ==================== 文本收集（递归）====================

function collectTexts(obj: any, set: Set<string>): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string') {
    if (obj.trim() && obj.length >= 2 &&
      /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(obj)) {
      set.add(obj.trim());
    }
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach(item => collectTexts(item, set));
    return;
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        collectTexts(obj[key], set);
      }
    }
  }
}
```

## `src/core/hooks/engine.ts`

```ts
/**
 * engine.ts — 游戏引擎 Hook 集合
 *
 * 修复（Bug 修复）：
 *  - hookRPGMaker 中 try { args[0] = String(args[0]); } 缺少闭合括号
 *  - 各 hook 增加开关关闭时的 uninstall 调用
 *  - 增加 console.log 调试输出
 *  - Bitmap.drawText 防止非字符串参数崩溃
 */

import config from '../../config';
import logger, { LogLevel } from '../logger';
import { hookPrototype, uninstallHook } from './utils';

type HookCallback = (text: string) => any;

// ==================== Bitmap Hook ====================

export function hookBitmap(callback: HookCallback): void {
  if (typeof window.Bitmap === 'undefined') {
    logger.addLog('[Engine] Bitmap 不可用，跳过 Hook', LogLevel.WARNING);
    return;
  }

  console.log('[MToolTranslatorPlugin][Engine] 🎨 Hook Bitmap.drawText');

  //drawText(text, x, y, maxWidth, align)
  hookPrototype('Bitmap', 'drawText', (_, ...args: any[]) => {
    const text = args[0];
    if (typeof text !== 'string') return args;
    if (text.length === 0) return args;
    if (config.debug) console.log(`[MToolTranslatorPlugin][Bitmap] drawText: "${text.slice(0, 30)}"`);
    args[0] = callback(text);
    return args;
  });

  //drawTextEx(text, x, y, maxWidth, align, options)
  hookPrototype('Bitmap', 'drawTextEx', (_, ...args: any[]) => {
    const text = args[0];
    if (typeof text !== 'string') return args;
    if (text.length === 0) return args;
    args[0] = callback(text);
    return args;
  });
}

export function unhookBitmap(): void {
  uninstallHook('Bitmap', 'drawText');
  uninstallHook('Bitmap', 'drawTextEx');
}

// ==================== Canvas 2D Hook ====================

export function hookCanvas(callback: HookCallback): void {
  if (typeof window.CanvasRenderingContext2D === 'undefined') {
    logger.addLog('[Engine] Canvas2D 不可用，跳过 Hook', LogLevel.WARNING);
    return;
  }

  console.log('[MToolTranslatorPlugin][Engine] 🖼️ Hook Canvas2D.fillText');

  for (const methodName of ['fillText', 'strokeText']) {
    //fillText(text, x, y, maxWidth, align)
    //strokeText(text, x, y, maxWidth, align)
    hookPrototype('CanvasRenderingContext2D', methodName, (_, ...args: any[]) => {
      const text = args[0];
      if (typeof text !== 'string') return args;
      if (text.length === 0) return args;
      if (config.debug) console.log(`[MToolTranslatorPlugin][Canvas] ${methodName}: "${text.slice(0, 30)}"`);
      args[0] = callback(text);
      return args;
    });
  }
}

export function unhookCanvas(): void {
  uninstallHook('CanvasRenderingContext2D', 'fillText');
  uninstallHook('CanvasRenderingContext2D', 'strokeText');
}

// ==================== RPG Maker Hook ====================

export function hookRPGMaker(callback: HookCallback): void {
  if (typeof window.Window_Base === 'undefined' && typeof window.Scene_Base === 'undefined') {
    logger.addLog('[Engine] RPG Maker 未检测到，跳过 Hook', LogLevel.WARNING);
    return;
  }

  console.log('[MToolTranslatorPlugin][Engine] 🎮 Hook RPG Maker');

  // ---- Window_Base.drawText ----
  //drawText(text, x, y, maxWidth, align)
  if (typeof window.Window_Base !== 'undefined') {
    hookPrototype('Window_Base', 'drawText', (_, ...args: any[]) => {
      const text = args[0];
      if (typeof text !== 'string') return args;
      if (text.length === 0) return args;
      if (config.debug) console.log(`[MToolTranslatorPlugin][RPG] drawText: "${text.slice(0, 30)}`);
      args[0] = callback(text);
      return args;
    });

    // convertEscapeCharacters — 处理转义序列中的文本
    //convertEscapeCharacters(text)
    hookPrototype('Window_Base', 'convertEscapeCharacters', (_, ...args: any[]) => {
      if (typeof args[0] !== 'string') return args;
      const text = callback(args[0]);
      args[0] = text;
      return args;
    });
  }

  // ---- Scene_Base / Game_Interpreter ----
  // command101(params)
  if (typeof window.Game_Interpreter !== 'undefined') {
    hookPrototype('Game_Interpreter', 'command101', (_, ...args: any[]) => {
      // 对话命令 — 在显示前拦截
      try {
        // @ts-ignore
        const interpreter = (this as any);
        const params = interpreter._params;
        if (params && params[0] && typeof params[0] === 'string') {
          const text = callback(params[0]);
          if (typeof text === 'string') {
            params[0] = text;
          } else if (Array.isArray(text) && typeof text[0] === 'string') {
            params[0] = text[0];
          }
        }
      } catch (e) { /* ignore */ }
      return args;
    });
  }

  // ---- 文本转义保护 ----
  // drawTextEx(text, x, y, maxWidth, align, options)
  if (typeof window.Window_Base !== 'undefined') {
    hookPrototype('Window_Base', 'drawTextEx', (_, ...args: any[]) => {
      if (typeof args[0] !== 'string') return args;
      const text = callback(args[0]);
      args[0] = text;
      return args;
    });
  }
}

export function unhookRPGMaker(): void {
  uninstallHook('Window_Base', 'drawText');
  uninstallHook('Window_Base', 'convertEscapeCharacters');
  uninstallHook('Window_Base', 'drawTextEx');
  uninstallHook('Game_Interpreter', 'command101');
}

// ==================== PixiJS Hook ====================

export function hookPixiJS(callback: HookCallback): void {
  if (typeof window.PIXI === 'undefined') {
    logger.addLog('[Engine] PixiJS 不可用，跳过 Hook', LogLevel.WARNING);
    return;
  }
  if (config.debug)
    console.log('[MToolTranslatorPlugin][Engine] 🧊 Hook PixiJS.Text');

  // PIXI.Text.prototype.updateText 或 _updateText
  // updateText(text) 或 setText(text)
  const TextCls = window.PIXI.Text || window.PIXI.BitmapText;
  if (!TextCls) {
    logger.addLog('[Engine] PIXI.Text 不可用', LogLevel.WARNING);
    return;
  }

  const proto = TextCls.prototype;
  const targetMethod = proto.updateText || proto._updateText || proto.setText;

  if (typeof targetMethod !== 'function') {
    logger.addLog('[Engine] PIXI.Text 无可 hook 方法', LogLevel.WARNING);
    return;
  }

  const methodName = targetMethod === proto.updateText ? 'updateText'
    : targetMethod === proto._updateText ? '_updateText' : 'setText';

  hookPrototype('PIXI.Text', methodName, (_, ...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].length > 0) {
      if (config.debug) console.log(`[MToolTranslatorPlugin][Pixi] ${methodName}: "${args[0].slice(0, 30)}`);
      args[0] = callback(args[0]);
    }
    return args;
  });
}

export function unhookPixiJS(): void {
  uninstallHook('PIXI.Text', 'updateText');
  uninstallHook('PIXI.Text', '_updateText');
  uninstallHook('PIXI.Text', 'setText');
}

// ==================== Cocos2d Hook ====================

export function hookCocos(callback: HookCallback): void {
  const cc = window.cc;
  if (!cc) {
    logger.addLog('[Engine] Cocos2d 不可用，跳过 Hook', LogLevel.WARNING);
    return;
  }
  if (config.debug)
    console.log('[MToolTranslatorPlugin][Engine] 🎯 Hook Cocos2d');

  // cc.Label.setString(text)
  if (cc.Label && cc.Label.prototype) {
    hookPrototype('cc.Label', 'setString', (_, ...args: any[]) => {
      if (typeof args[0] === 'string') {
        if (config.debug) console.log(`[MToolTranslatorPlugin][Cocos] setString: "${args[0].slice(0, 30)}`);
        args[0] = callback(args[0]);
      }
      return args;
    });
  }

  // // cc.RichText
  // if (cc.RichText && cc.RichText.prototype) {
  //   hookPrototype('cc.RichText', 'string', (original, ...args: any[]) => {
  //     // 这是 setter 方式，不一定能 hook prototype
  //   });
  // }
}

export function unhookCocos(): void {
  uninstallHook('cc.Label', 'setString');
}

export function hookPhaser(callback: HookCallback): void {
  if (typeof window.Phaser === 'undefined') {
    logger.addLog('[Engine] Phaser 不可用，跳过 Hook', LogLevel.WARNING);
    return;
  }

  const TextClass = window.Phaser.GameObjects?.Text;
  if (!TextClass) {
    logger.addLog('[Engine] Phaser.GameObjects.Text 不可用', LogLevel.WARNING);
    return;
  }

  console.log('[MToolTranslatorPlugin][Engine] 🎮 Hook Phaser.GameObjects.Text.setText');

  hookPrototype('Phaser.GameObjects.Text', 'setText', (_, ...args: any[]) => {
    const text = args[0];
    if (typeof text !== 'string') return args;
    if (text.length === 0) return args;
    if (config.debug) console.log(`[MToolTranslatorPlugin][Phaser] setText: "${text.slice(0, 30)}"`);
    args[0] = callback(text);
    return args;
  });
}

export function unhookPhaser(): void {
  uninstallHook('Phaser.GameObjects.Text', 'setText');
}
```

## `src/core/hooks/network.ts`

```ts
/**
 * network.ts — Fetch / XHR 通用拦截
 *
 * 修复（Bug 修复）：
 *  - hookFetch 盲目 response.clone().json() 导致图片/字体/音频等二进制资源损坏
 *  - 新增 isResourcePath 检测，资源路径直接放行
 *  - 响应替换时保留原始 status / content-type
 *  - 改为通用函数：接收 shouldIntercept / transformRequest / transformResponse 钩子
 *  - 增加 console.log 调试输出
 */

import config from '../../config';
import { isResourcePath, safeJSONParse } from '../../utils';
import logger, { LogLevel } from '../logger';

type HookCallback = (...args: any[]) => any;

// ==================== Fetch Hook ====================

let fetchHooked = false;
let fetchOriginal: typeof fetch | null = null;

export function hookFetch(options: Options.FetchHookOptions = {}): void {
  if (fetchHooked) {
    logger.addLog('[Fetch] 已安装，跳过重复安装', LogLevel.DEBUG);
    return;
  }
  if (typeof window.fetch === 'undefined') {
    logger.addLog('[Fetch] window.fetch 不可用', LogLevel.ERROR);
    return;
  }

  const {
    shouldIntercept,
    transformRequest,
    transformResponse,
    jsonOnly = true,
  } = options;

  fetchOriginal = window.fetch.bind(window);
  fetchHooked = true;

  console.log('[MToolTranslatorPlugin][Fetch] ✅ Fetch Hook 已安装', { jsonOnly });

  window.fetch = async function (...args: any[]): Promise<Response> {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const method = (init?.method || 'GET').toUpperCase();

    // 1. 资源路径直接放行
    if (isResourcePath(url)) {
      console.log(`[MToolTranslatorPlugin][Fetch] ⏭️ 资源放行: ${method} ${url}`);
      //@ts-ignore
      return fetchOriginal!(...args);
    }

    // 2. 用户自定义过滤
    if (shouldIntercept && !shouldIntercept(url, init)) {
      console.log(`[MToolTranslatorPlugin][Fetch] ⏭️ 自定义过滤放行: ${method} ${url}`);
      //@ts-ignore
      return fetchOriginal!(...args);
    }

    // 3. 请求体变换
    let newArgs = args;
    if (transformRequest) {
      const transformed = transformRequest(args);
      if (transformed === null) {
        // null 表示完全拦截，不发送网络请求
        console.log(`[MToolTranslatorPlugin][Fetch] 🚫 请求被拦截: ${method} ${url}`);
        return new Response(JSON.stringify({ intercepted: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      newArgs = transformed;
    }

    console.log(`[MToolTranslatorPlugin][Fetch] ➡️ ${method} ${url}`);

    // 4. 发送请求
    //@ts-ignore
    const response = await fetchOriginal!(...newArgs);

    // 5. 仅处理 JSON 响应（保护二进制资源）
    if (jsonOnly) {
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json') && !contentType.includes('text')) {
        console.log(`[MToolTranslatorPlugin][Fetch] ⏭️ 非JSON响应放行: ${contentType}`);
        return response;
      }
    }

    // 6. 响应变换
    if (transformResponse) {
      try {
        const body = await response.clone().json();
        const newBody = transformResponse(body, url, init);
        if (config.debug) {
          console.log(`[MToolTranslatorPlugin][Fetch] ✏️ 响应已变换: ${url}`);
        }
        return new Response(JSON.stringify(newBody), {
          status: response.status,
          statusText: response.statusText,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e: any) {
        logger.addLog(`[Fetch] 响应变换失败: ${e.message}`, LogLevel.ERROR);
        return response;
      }
    }

    return response;
  } as typeof fetch;
}

export function unhookFetch(): void {
  if (!fetchHooked || !fetchOriginal) return;
  window.fetch = fetchOriginal;
  fetchOriginal = null;
  fetchHooked = false;
  console.log('[MToolTranslatorPlugin][Fetch] ↩️ Fetch Hook 已还原');
}

// ==================== XHR Hook ====================

let xhrHooked = false;
const xhrOriginalOpen = XMLHttpRequest.prototype.open;
const xhrOriginalSend = XMLHttpRequest.prototype.send;

export function hookXHR(
  options: Options.XHRHookOptions = {},
  callback: HookCallback = () => { }
): void {
  if (xhrHooked) {
    logger.addLog('[XHR] 已安装，跳过重复安装', LogLevel.DEBUG);
    return;
  }
  if (typeof window.XMLHttpRequest === 'undefined') {
    logger.addLog('[XHR] XMLHttpRequest 不可用', LogLevel.ERROR);
    return;
  }

  const {
    urlPatterns = [],
    method = 'GET',
    transformRequest,
    transformResponse
  } = options;

  xhrHooked = true;
  if (config.debug) {
    console.log('[MToolTranslatorPlugin][XHR] ✅ XHR Hook 已安装', { urlPatterns });
  }

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest & { _url?: string; _method?: string },
    method: string,
    url: string,
    ...rest: any[]
  ) {
    this._url = url;
    this._method = method.toUpperCase();
    if (config.debug) {
      console.log(`[MToolTranslatorPlugin][XHR] ➡️ ${method} ${url}`);
    }
    //@ts-ignore
    return xhrOriginalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest & {
      _url?: string;
      _method?: string
    },
    body?: any
  ) {
    const url = this._url || '';
    const method_ = this._method || 'SEND';

    // 资源路径放行
    if (isResourcePath(url)) {
      if (config.debug) {
        console.log(`[MToolTranslatorPlugin][XHR] ⏭️ 资源放行: ${url}`);
      }
      return xhrOriginalSend.call(this, body);
    }

    // URL 模式匹配
    const matched = urlPatterns.length === 0 || urlPatterns.some(p => {
      if (p instanceof RegExp) return p.test(url);
      return url.includes(p);
    });

    if (!matched || method_ !== method) {
      return xhrOriginalSend.call(this, body);
    }

    // 请求体变换
    let newBody = body;
    if (transformRequest && typeof body === 'string') {
      const result = transformRequest(body, url);
      if (result === null) {
        if (config.debug) {
          console.log(`[MToolTranslatorPlugin][XHR] 🚫 请求被拦截: ${url}`);
        }
        // 模拟响应
        Object.defineProperty(this, 'readyState', { value: 4, writable: true });
        Object.defineProperty(this, 'status', { value: 200, writable: true });
        Object.defineProperty(this, 'responseText', { value: '{"intercepted":true}', writable: true });
        this.dispatchEvent(new Event('load'));
        return;
      }
      newBody = result;
    }

    // 响应拦截
    if (transformResponse) {
      this.addEventListener('readystatechange', () => {
        if (this.readyState === 4 && this.status === 200) {
          try{
            const contentType = this.getResponseHeader('content-type') || '';
            let originalResponse: any;
            const rt = (this as any).responseType;
            if (rt === 'json') {
              originalResponse = this.response;
            } else if (rt === 'blob' || rt === 'arraybuffer' || rt === 'document') {
              return;
            } else {
              // responseType 为 '' 或 'text'，用 responseText
              if (!contentType.includes('json') && !contentType.includes('text')) {
                return;
              }
              originalResponse = safeJSONParse(this.responseText);
            }
            const newResponse = transformResponse(originalResponse, url);
            if (config.debug) {
              console.log(`[MToolTranslatorPlugin][XHR] ✏️ 响应已变换: ${url}`);
            }
            if (rt === 'json') {
              Object.defineProperty(this, 'response', {
                value: newResponse,
                writable: false,
                configurable: true,
              });
            } else {
              Object.defineProperty(this, 'responseText', {
                value: JSON.stringify(newResponse),
                writable: false,
                configurable: true,
              });
            }
          } catch (e: any) {
            logger.addLog(`[XHR] 响应变换失败: ${e.message}`, LogLevel.ERROR);
          }
        }
      });
    }

    // 通知回调
    try { callback(body, url); } catch (e) { /* ignore */ }

    return xhrOriginalSend.call(this, newBody);
  };

  // 拦截 setRequestHeader
  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (header: string, value: string) {
    return originalSetHeader.call(this, header, value);
  };
}

export function unhookXHR(): void {
  if (!xhrHooked) return;
  XMLHttpRequest.prototype.open = xhrOriginalOpen;
  XMLHttpRequest.prototype.send = xhrOriginalSend;
  xhrHooked = false;
  console.log('[MToolTranslatorPlugin][XHR] ↩️ XHR Hook 已还原');
}
```

## `src/core/hooks/utils.ts`

```ts
/**
 * Hook 工具函数 — 统一方法劫持/还原
 *
 * 修复（Bug 修复）：
 *  - uninstallHook 原路径是 (window)[className][methodName]，
 *    但安装时挂的是 prototype，还原也必须走 prototype
 *  - 增加 installHook / uninstallHook 的调试日志
 *  - 支持引擎开关关闭时正确还原原函数
 */
import logger, { LogLevel } from '../logger';
const originalMethods = new Map<string, { className: string; methodName: string; original: any }>();

/**
 * 劫持某个类的原型方法
 * @param className  全局类名（如 'Bitmap', 'DataManager'）
 * @param methodName 方法名（如 'drawText', 'onLoad'）
 * @param hookFn     包装函数，接收 (original, ...args)，返回新的 args 数组
 */
export function hookPrototype(
  className: string,
  methodName: string,
  hookFn: (original: Function, ...args: any[]) => any[]
): void {
  const cls = (window as any)[className];
  if (!cls || !cls.prototype) {
    logger.addLog(`[Hook] ${className}.prototype 不存在，跳过 ${methodName}`, LogLevel.WARNING);
    return;
  }

  const original = cls.prototype[methodName];
  if (typeof original !== 'function') {
    logger.addLog(`[Hook] ${className}.${methodName} 不是函数，跳过`, LogLevel.WARNING);
    return;
  }

  // 防止重复 hook
  const key = `${className}.${methodName}`;
  if (originalMethods.has(key)) {
    logger.addLog(`[Hook] ${key} 已劫持，跳过重复安装`, LogLevel.DEBUG);
    return;
  }

  // 保存原始方法
  originalMethods.set(key, { className, methodName, original });

  cls.prototype[methodName] = function (...args: any[]) {
    try {
      const newArgs = hookFn.call(this, original.bind(this), ...args);
      if (Array.isArray(newArgs)) {
        return original.apply(this, newArgs);
      }
      return original.apply(this, args);
    } catch (e: any) {
      logger.addLog(`[Hook] ${key} 执行异常: ${e.message}`, LogLevel.ERROR);
      return original.apply(this, args);
    }
  };

  console.log(`[MToolTranslatorPlugin][Hook] ✅ ${key} 已劫持`);
}

/**
 * 还原某个类的原型方法
 * @param className  全局类名
 * @param methodName 方法名
 */
export function uninstallHook(className: string, methodName: string): boolean {
  const key = `${className}.${methodName}`;
  const saved = originalMethods.get(key);
  if (!saved) {
    logger.addLog(`[Hook] ${key} 无原始方法可还原`, LogLevel.DEBUG);
    return false;
  }

  const cls = (window as any)[className];
  if (cls && cls.prototype) {
    cls.prototype[methodName] = saved.original;
    originalMethods.delete(key);
    console.log(`[MToolTranslatorPlugin][Hook] ↩️ ${key} 已还原`);
    logger.addLog(`[Hook] ${key} 已还原`, LogLevel.INFO);
    return true;
  }

  return false;
}


/**
 * Hook 一个对象的 setter（用于属性赋值拦截）
 */
export function hookSetter(
  className: string,
  propertyName: string,
  hookFn: (originalValue: any, newValue: any) => any
): void {
  const cls = (window as any)[className];
  if (!cls || !cls.prototype) {
    logger.addLog(`[Hook] ${className} 不存在，跳过 setter ${propertyName}`, LogLevel.WARNING);
    return;
  }

  const descriptor = Object.getOwnPropertyDescriptor(cls.prototype, propertyName);
  const originalSetter = descriptor?.set;

  Object.defineProperty(cls.prototype, propertyName, {
    get: descriptor?.get,
    set: function (this: any, value: any) {
      try {
        const newValue = hookFn.call(this, originalSetter ? originalSetter.call(this, value) : undefined, value);
        if (originalSetter) {
          originalSetter.call(this, newValue);
        } else {
          // 如果没有原 setter，直接赋值到内部属性
          (this as any)[`_${propertyName}`] = newValue;
        }
      } catch (e: any) {
        logger.addLog(`[Hook] ${className}.${propertyName} setter 异常: ${e.message}`, LogLevel.ERROR);
        if (originalSetter) originalSetter.call(this, value);
      }
    },
    enumerable: descriptor?.enumerable ?? true,
    configurable: true,
  });

  console.log(`[MToolTranslatorPlugin][Hook] ✅ ${className}.${propertyName} setter 已劫持`);
}
```

## `src/core/hooks/websocket.ts`

```ts
/**
 * websocket.ts — 统一 WebSocket Hook 实现
 *
 * 修复（Bug 修复）：
 *  - 删除根目录 wsHook.ts（与 mootHook.ts 重复）
 *  - 统一 pendingMap 管理
 *  - 增加 console.log 调试输出
 *  - 资源路径/非目标 WS 连接直接放行
 *  - 支持完整还原（uninstall）
 */

import logger, { LogLevel } from '../logger';
import translator from '../translator';
import { isResourcePath, safeJSONParse } from '../../utils';

type PendingRequest = {
  original: string;
  timestamp: number;
  resolve: (fixed: string) => void;
}

const PENDING_CLEANUP_INTERVAL = 5000;

export class WebSocketHook {
  private hooked = false;
  private OriginalWebSocket: typeof WebSocket | null = null;
  private pendingMap = new Map<number, PendingRequest>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private options: Required<Options.WebSocketHookOptions>;
  private instances: Set<WebSocket> = new Set();

  constructor(options: Options.WebSocketHookOptions = {}) {
    this.options = {
      targetURL: options.targetURL || '127.0.0.1:64002',
      enableRequestFix: options.enableRequestFix ?? true,
      enableResponseFix: options.enableResponseFix ?? true,
      translateFn: options.translateFn || ((text: string) => {
        try {
          return translator.interceptText(text);
        } catch {
          return null;
        }
      }),
      fixResponseFn: options.fixResponseFn || ((orig, ai) => {
        try {
          return translator.processAIResponse(orig, ai);
        } catch {
          return ai;
        }
      }),
      pendingTimeout: options.pendingTimeout || 30000,
    };
  }

  set hookOptions(options: Options.WebSocketHookOptions) {
    this.options = {
      ...this.options,
      ...options,
    };
  }

  // ==================== 安装 ====================

  install(): boolean {
    if (this.hooked) {
      logger.addLog('[WS] 已安装，跳过重复安装', LogLevel.WARNING);
      return false;
    }
    if (typeof window.WebSocket === 'undefined') {
      logger.addLog('[WS] WebSocket 不可用', LogLevel.ERROR);
      return false;
    }

    this.OriginalWebSocket = window.WebSocket;
    const self = this;
    const opts = this.options;

    console.log(`[MToolTranslatorPlugin][WS] ✅ WebSocket Hook 安装中 (target=${opts.targetURL})`);

    const HookedWebSocket = class extends this.OriginalWebSocket {
      constructor(url: string | URL, ...args: any[]) {
        super(url, ...args);
        const urlStr = String(url);
        const isTarget = urlStr.includes(opts.targetURL);

        console.log(`[MToolTranslatorPlugin][WS] 🔌 连接: ${urlStr}${isTarget ? ' [目标]' : ''}`);

        // 非目标连接：不 hook
        if (!isTarget) return;

        self.instances.add(this as any);

        // 启动定期清理
        if (!self.cleanupTimer) {
          self.cleanupTimer = setInterval(() => self._cleanupPending(), PENDING_CLEANUP_INTERVAL);
        }

        // ---- Hook send ----
        const originalSend = (this as any).send.bind(this);
        (this as any).send = function (...sendArgs: any[]) {
          const data = sendArgs[0];
          if (typeof data === 'string' && opts.enableRequestFix) {
            const intercepted = self._interceptRequest(data, (fixedRet) => {
              // 通过伪造 message 事件回送
              self._dispatchFakeMessage(fixedRet, this as WebSocket);
            });
            if (intercepted) {
              console.log(`[MToolTranslatorPlugin][WS] 🚫 send 已拦截: ${data.slice(0, 40)}`);
              return; // 不发网络请求
            }
          }
          return originalSend(...sendArgs);
        };

        // ---- Hook onmessage ----
        const wsRef = this as unknown as WebSocket;
        wsRef.addEventListener('message', (event: MessageEvent) => {
          if (!opts.enableResponseFix) return;
          self._interceptResponse(event);
        });

        // ---- 关闭时清理 ----
        wsRef.addEventListener('close', () => {
          self.instances.delete(wsRef);
          if (self.instances.size === 0 && self.cleanupTimer) {
            clearInterval(self.cleanupTimer);
            self.cleanupTimer = null;
          }
        });
      }
    };

    window.WebSocket = HookedWebSocket as any;
    this.hooked = true;

    logger.addLog(
      `[WS] Hook 已安装 (target=${opts.targetURL}, reqFix=${opts.enableRequestFix}, respFix=${opts.enableResponseFix})`,
      LogLevel.SUCCESS
    );
    return true;
  }

  // ==================== 卸载 ====================

  uninstall(): boolean {
    if (!this.hooked || !this.OriginalWebSocket) return false;

    window.WebSocket = this.OriginalWebSocket;
    this.OriginalWebSocket = null;
    this.hooked = false;
    this.pendingMap.clear();
    this.instances.clear();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    console.log('[MToolTranslatorPlugin][WS] ↩️ WebSocket Hook 已还原');
    logger.addLog('[WS] Hook 已还原', LogLevel.INFO);
    return true;
  }

  // ==================== 请求拦截 ====================

  private _interceptRequest(data: string, _onIntercept: (ret: any) => void): boolean {
    let parsed: any;
    try {
      parsed = safeJSONParse(data);
    } catch { return false; }

    // 支持 cmd: 'trs' 和 'tr' 两种格式
    const cmd = parsed.cmd || parsed.command;
    if (cmd !== 'trs' && cmd !== 'tr') return false;
    if (!Array.isArray(parsed.args) || parsed.args.length === 0) return false;

    const originalText: string = parsed.args[0];
    if (!originalText || typeof originalText !== 'string') return false;

    // 资源路径放行
    if (isResourcePath(originalText)) {
      console.log(`[MToolTranslatorPlugin][WS] ⏭️ 资源放行: ${originalText}`);
      return false;
    }

    // 尝试本地翻译
    const localResult = this.options.translateFn(originalText);
    if (localResult && localResult !== originalText) {
      const fakeResponse = {
        id: parsed.id ?? Date.now(),
        ret: localResult,
        error: false,
        type: 1,
      };

      console.log(`[MToolTranslatorPlugin][WS] ✅ 本地翻译命中: "${originalText.slice(0, 20)}..." → "${localResult.slice(0, 30)}..."`);

      // 异步派发伪造响应
      setTimeout(() => {
        this._dispatchFakeMessage(fakeResponse);
      }, 0);

      return true; // 拦截，不发网络请求
    }

    // 未命中本地 → 记录 pending，等响应回来再修复
    this.pendingMap.set(parsed.id ?? Date.now(), {
      original: originalText,
      timestamp: Date.now(),
      resolve: () => { },
    });

    console.log(`[MToolTranslatorPlugin][WS] ⏳ 未命中本地，等待 AI 响应: "${originalText.slice(0, 20)}..."`);
    return false; // 放行到网络
  }

  // ==================== 响应拦截 ====================

  private _interceptResponse(event: MessageEvent): void {
    if (typeof event.data !== 'string') return;

    let parsed: any;
    try {
      parsed = safeJSONParse(event.data);
    } catch { return; }
    if (typeof parsed.ret !== 'string') return;

    const pending = this.pendingMap.get(parsed.id);
    const original = pending?.original || '';

    const fixed = this.options.fixResponseFn(original, parsed.ret || '');

    if (fixed && fixed !== parsed.ret) {
      console.log(`[MToolTranslatorPlugin][WS] ✏️ AI 译文已修复: "${parsed.ret.slice(0, 20)}..." → "${fixed.slice(0, 30)}..."`);
      logger.addLog(
        `[WS] AI 译文修复: "${parsed.ret.slice(0, 20)}..." → "${fixed.slice(0, 30)}..."`,
        LogLevel.DEBUG
      );
    }

    // 无论是否修复，都更新 ret 并重新派发
    parsed.ret = fixed || parsed.ret;

    if (pending) this.pendingMap.delete(parsed.id);

    // 阻止原始事件传播，派发新事件
    event.stopImmediatePropagation();
    this._dispatchFakeMessage(parsed, event.target as WebSocket);
  }

  // ==================== 伪造消息派发 ====================

  private _dispatchFakeMessage(response: any, target?: WebSocket): void {
    const event = new MessageEvent('message', {
      data: JSON.stringify(response),
      origin: 'ws://127.0.0.1:64002',
      lastEventId: '',
      source: null,
      ports: undefined as any,
    });

    const ws = target || (this.instances.values().next().value as WebSocket);
    if (ws && (ws as any).onmessage) {
      (ws as any).onmessage(event);
    } else {
      // 如果没有 onmessage，手动 dispatch
      ws?.dispatchEvent(event);
    }
  }

  // ==================== 定期清理 ====================

  private _cleanupPending(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, pending] of this.pendingMap) {
      if (now - pending.timestamp > this.options.pendingTimeout) {
        this.pendingMap.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[MToolTranslatorPlugin][WS] 🧹 清理 ${cleaned} 条超时 pending`);
    }
  }

  // ==================== 公开查询 API ====================

  get isHooked(): boolean { return this.hooked; }

  get pendingCount(): number { return this.pendingMap.size; }

  clearPending(): void { this.pendingMap.clear(); }

  getStats() {
    return {
      hooked: this.hooked,
      pendingCount: this.pendingMap.size,
      activeInstances: this.instances.size,
      targetURL: this.options.targetURL,
    };
  }
}
```

