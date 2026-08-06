import config from '../config';
import logger, { LogLevel } from './logger';

/**
 * AI 翻译模块
 * - 兼容 OpenAI / DeepSeek / 任何 OpenAI 兼容 API
 * - 支持批量翻译、异步队列
 * - 带超时和重试机制
 * - 结果缓存避免重复请求
 */
const aiCache = new Map<string, string>();
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

export class AITranslator {
  private baseURL: string;
  private apiKey: string;
  private model: string;
  private enabled: boolean;

  constructor() {
    const u = config.user;
    this.baseURL = u.AI_BASE_URL.userConfig || u.AI_BASE_URL.default;
    this.apiKey = u.AI_KEY.userConfig || '';
    this.model = u.model.userConfig || u.model.default;
    this.enabled = u.enableAI.userConfig ?? false;
  }

  updateConfig() {
    const u = config.user;
    this.baseURL = u.AI_BASE_URL.userConfig || u.AI_BASE_URL.default;
    this.apiKey = u.AI_KEY.userConfig || '';
    this.model = u.model.userConfig || u.model.default;
    this.enabled = u.enableAI.userConfig ?? false;
  }

  isAvailable(): boolean {
    return this.enabled && !!this.apiKey && !!this.baseURL;
  }

  async translate(text: string, options: Config.AITranslateOptions = {}): Promise<string> {
    if (!this.isAvailable()) return text;
    if (!text || text.trim().length === 0) return text;

    // 缓存命中
    const cacheKey = `${options.targetLang || config.user.targetLang.userConfig}:${text}`;
    if (aiCache.has(cacheKey)) return aiCache.get(cacheKey)!;

    // 去重：同一文本正在翻译中
    if (pendingRequests.has(cacheKey)) {
      return pendingRequests.get(cacheKey)!;
    }

    const promise = this._doTranslate(text, options);
    pendingRequests.set(cacheKey, promise);

    try {
      const result = await promise;
      aiCache.set(cacheKey, result);
      return result;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  }

  async translateBatch(texts: string[], options: Config.AITranslateOptions = {}): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    if (!this.isAvailable() || texts.length === 0) return results;

    // 过滤已缓存的
    const uncached: string[] = [];
    for (const t of texts) {
      const cacheKey = `${options.targetLang || config.user.targetLang.userConfig}:${t}`;
      if (aiCache.has(cacheKey)) {
        results.set(t, aiCache.get(cacheKey)!);
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
        const cacheKey = `${options.targetLang || config.user.targetLang.userConfig}:${k}`;
        aiCache.set(cacheKey, v);
      }
    }

    return results;
  }

  clearCache() {
    aiCache.clear();
    logger.addLog('AI 翻译缓存已清除', LogLevel.INFO);
  }

  getCacheStats() {
    return { size: aiCache.size, pending: pendingRequests.size };
  }

  private async _doTranslate(
    text: string,
    options: Config.AITranslateOptions
  ): Promise<string> {
    return this._withRetry(async () => {
      const targetLang = options.targetLang || config.user.targetLang.userConfig || 'zh-CN';
      const sourceLang = options.sourceLang || 'ja';
      const systemPrompt = (options.systemPrompt || DEFAULT_SYSTEM_PROMPT).replace(
        '{target_lang}',
        String(targetLang)
      );

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeout || 30000);

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
              { role: 'user', content: `Source language: ${sourceLang}\nTarget language: ${targetLang}\n\nTranslate:\n${text}` },
            ],
            temperature: 0.7,
            max_tokens: 2048,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`AI API 错误 [${response.status}]: ${await response.text()}`);
        }

        const data = (await response.json()) as API.AIResponse;
        const content = data.choices?.[0]?.message?.content?.trim();
        return content || text;
      } finally {
        clearTimeout(timeout);
      }
    }, options.maxRetries || 3);
  }

  private async _translateBatchInternal(
    texts: string[],
    options: Config.AITranslateOptions
  ): Promise<Map<string, string>> {
    return new Promise((resolve) => {
      const task = async () => {
        activeRequests++;
        try {
          const targetLang = options.targetLang || config.user.targetLang.userConfig || 'zh-CN';
          const sourceLang = options.sourceLang || 'ja';
          const combinedText = texts
            .map((t, i) => `[${i}] ${t}`)
            .join('\n');

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), options.timeout || 60000);

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
                  content: `你是一个游戏本地化翻译引擎。将以下带编号的文本逐条翻译为${targetLang}。
规则：仅输出翻译结果，格式为 [编号] 翻译文本，每行一条。保持换行符和占位符不变。`,
                },
                { role: 'user', content: `Source: ${sourceLang}\n\n${combinedText}` },
              ],
              temperature: 0.3,
              max_tokens: 4096,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (!response.ok) throw new Error(`AI Batch API 错误 [${response.status}]`);

          const data = (await response.json()) as API.AIResponse;
          const content = data.choices?.[0]?.message?.content || '';
          const results = new Map<string, string>();

          // 解析 [index] text 格式
          const lines = content.split('\n');
          for (const line of lines) {
            const m = line.match(/^\[(\d+)\]\s*(.+)$/);
            if (m) {
              const idx = parseInt(m[1]);
              if (idx >= 0 && idx < texts.length) {
                results.set(texts[idx], m[2].trim());
              }
            }
          }

          // 未匹配到的保持原文
          for (const t of texts) {
            if (!results.has(t)) results.set(t, t);
          }

          resolve(results);
        } catch (e: any) {
          logger.addLog(`AI 批量翻译失败: ${e.message}`, LogLevel.ERROR);
          const fallback = new Map<string, string>();
          texts.forEach(t => fallback.set(t, t));
          resolve(fallback);
        } finally {
          activeRequests--;
          // 处理队列
          const next = requestQueue.shift();
          if (next) next();
        }
      };

      // 并发控制
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