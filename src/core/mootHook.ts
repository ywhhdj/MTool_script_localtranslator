import logger, { LogLevel } from './logger';
import { WebSocketHook } from './hooks/websocket';
import translator from './translator';
import aiFixRules, { type AIFixRule } from './aiFixRules';
import config from '../config';
import { safeJSONParse, xhrRequest } from '../utils';

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