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