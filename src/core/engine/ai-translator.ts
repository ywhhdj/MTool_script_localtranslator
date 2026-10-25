/**
 * engine/ai-translator.ts — AI 翻译客户端（OpenAI 兼容接口）
 *
 *   1. 注入的 HttpPort（安装 Hook 前抓取的 rawFetch）发请求；
 *   2. 并发队列曾经在 reject 分支不会释放名额（请求失败后队列永久堵塞）；
 *      finally 统一释放，并保证队列一定被推进；
 *   3. 缓存与 pending 用有界 LRU，避免长会话无限增长；
 *   4. 超时/重试/退避统一实现，失败一律回落原文（绝不把异常抛给游戏线程）；
 *   5. 相同文本的并发请求去重（复用同一个 Promise）。
 */

import { LruCache } from "../datastruct/lru-cache";
import type {
  ConfigReaderPort,
  HttpPort,
  LoggerPort,
  MetricsPort,
  SchedulerPort,
} from "../domain/ports";
import { DEFAULT_AI_SYSTEM_PROMPT } from "../config/defaults";

export interface AiTranslateOptions {
  sourceLang?: string;
  targetLang?: string;
  systemPrompt?: string;
  timeout?: number;
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface AiTranslatorDeps {
  http: HttpPort;
  config: ConfigReaderPort;
  logger: LoggerPort;
  scheduler: SchedulerPort;
  metrics?: MetricsPort;
  maxCache?: number;
  maxConcurrent?: number;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class AiTranslator {
  private http: HttpPort;
  private config: ConfigReaderPort;
  private logger: LoggerPort;
  private scheduler: SchedulerPort;
  private metrics?: MetricsPort;

  private baseURL = "";
  private apiKey = "";
  private model = "";
  private enabled = false;

  private cache: LruCache<string>;
  private pending = new Map<string, Promise<string>>();
  private queue: Array<() => void> = [];
  private active = 0;
  private maxConcurrent: number;
  private batchSize = 20;
  private disposed = false;

  constructor(deps: AiTranslatorDeps) {
    this.http = deps.http;
    this.config = deps.config;
    this.logger = deps.logger;
    this.scheduler = deps.scheduler;
    this.metrics = deps.metrics;
    this.maxConcurrent = Math.max(1, deps.maxConcurrent ?? 3);
    this.cache = new LruCache<string>(deps.maxCache ?? 2000);
    this.updateConfig();
  }

  // ==================== 配置 ====================

  updateConfig(): void {
    this.baseURL = String(this.config.get("AI_BASE_URL") ?? "");
    this.apiKey = String(this.config.get("AI_KEY") ?? "");
    this.model = String(this.config.get("model") ?? "");
    this.enabled = this.config.get("enableAI") === true && !!this.apiKey && !!this.baseURL;
  }

  get isAvailable(): boolean {
    return this.enabled && !!this.apiKey && !!this.baseURL && !this.disposed;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  // ==================== 单条 ====================

  async translate(text: string, options: AiTranslateOptions = {}): Promise<string> {
    if (!this.isAvailable || !text || !text.trim()) return text;
    const targetLang = options.targetLang ?? String(this.config.get("targetLang") ?? "zh-CN");
    const key = `${targetLang}:${text}`;

    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const inflight = this.pending.get(key);
    if (inflight) return inflight;

    const task = this.enqueue(() => this.request(text, options));
    this.pending.set(key, task);
    try {
      const result = await task;
      if (result && result !== text) this.cache.set(key, result);
      return result;
    } catch (e: any) {
      this.logger.warn(`[AI] 翻译失败: ${e?.message ?? e}`);
      return text;
    } finally {
      this.pending.delete(key);
    }
  }

  // ==================== 批量 ====================

  async translateBatch(
    texts: string[],
    options: AiTranslateOptions = {}
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    if (!this.isAvailable || texts.length === 0) return results;

    const targetLang = options.targetLang ?? String(this.config.get("targetLang") ?? "zh-CN");
    const uncached: string[] = [];
    for (const t of texts) {
      const cached = this.cache.get(`${targetLang}:${t}`);
      if (cached !== undefined) results.set(t, cached);
      else uncached.push(t);
    }
    if (uncached.length === 0) return results;

    for (let i = 0; i < uncached.length; i += this.batchSize) {
      const batch = uncached.slice(i, i + this.batchSize);
      try {
        const map = await this.enqueue(() => this.requestBatch(batch, options));
        for (const [k, v] of map) {
          results.set(k, v);
          if (v && v !== k) this.cache.set(`${targetLang}:${k}`, v);
        }
      } catch (e: any) {
        this.logger.warn(`[AI] 批量翻译失败: ${e?.message ?? e}`);
        for (const t of batch) if (!results.has(t)) results.set(t, t);
      }
    }
    return results;
  }

  dispose(): void {
    this.disposed = true;
    this.pending.clear();
    this.queue = [];
    this.cache.clear();
  }

  // ==================== 内部 ====================

  /** 有界并发：超过上限排队，任务结束（无论成败）都推进队列 */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.active++;
        task()
          .then(resolve, reject)
          .finally(() => {
            this.active--;
            const next = this.queue.shift();
            if (next) next();
          });
      };
      if (this.active >= this.maxConcurrent) this.queue.push(run);
      else run();
    });
  }

  private async request(text: string, options: AiTranslateOptions): Promise<string> {
    const targetLang = options.targetLang ?? String(this.config.get("targetLang") ?? "zh-CN");
    const sourceLang = options.sourceLang ?? "ja";
    const systemPrompt = (options.systemPrompt || DEFAULT_AI_SYSTEM_PROMPT).replace(
      "{target_lang}",
      targetLang
    );
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Source language: ${sourceLang}\nTarget language: ${targetLang}\n\nTranslate:\n${text}`,
        },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    };
    return this.withRetry(async () => {
      const data = await this.postChat(body, options.timeout ?? 30000);
      return data.choices?.[0]?.message?.content?.trim() || text;
    }, options.maxRetries ?? 2);
  }

  private async requestBatch(
    texts: string[],
    options: AiTranslateOptions
  ): Promise<Map<string, string>> {
    const targetLang = options.targetLang ?? String(this.config.get("targetLang") ?? "zh-CN");
    const sourceLang = options.sourceLang ?? "ja";
    const combined = texts.map((t, i) => `[${i}] ${t}`).join("\n");
    const body = {
      model: this.model,
      messages: [
        {
          role: "system",
          content: `你是一个游戏本地化翻译引擎。将以下带编号的文本逐条翻译为${targetLang}。规则：仅输出翻译结果，格式为 [编号] 翻译文本，每行一条。保持换行符和占位符不变。`,
        },
        { role: "user", content: `Source: ${sourceLang}\n\n${combined}` },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    };

    const results = new Map<string, string>();
    const data = await this.withRetry(
      () => this.postChat(body, options.timeout ?? 60000),
      options.maxRetries ?? 1
    );
    const content = data.choices?.[0]?.message?.content || "";
    for (const line of content.split("\n")) {
      const m = line.match(/^\[(\d+)\]\s*(.+)$/);
      if (!m) continue;
      const idx = parseInt(m[1], 10);
      if (idx >= 0 && idx < texts.length) results.set(texts[idx], m[2].trim());
    }
    for (const t of texts) if (!results.has(t)) results.set(t, t);
    this.metrics?.inc("ai.batch");
    return results;
  }

  private async postChat(body: unknown, timeoutMs: number): Promise<ChatResponse> {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller
      ? this.scheduler.timeout(() => controller.abort(), timeoutMs)
      : null;
    this.metrics?.inc("ai.request");
    try {
      const response = await this.http.fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller?.signal,
      } as RequestInit);
      if (!response.ok) {
        throw new Error(`AI API 错误 [${response.status}]`);
      }
      return (await response.json()) as ChatResponse;
    } finally {
      timer?.();
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e;
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          await new Promise((r) => this.scheduler.timeout(r, delay));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("AI 请求失败");
  }
}
