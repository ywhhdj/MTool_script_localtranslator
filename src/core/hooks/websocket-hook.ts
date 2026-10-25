/**
 * hooks/websocket-hook.ts — MTool 的 WebSocket 通信拦截
 *
 *   1. 「原地覆盖 event.data」（在实例上定义同名自有属性遮蔽原型 getter），
 *      不打断事件传播、不重派发、不重复回调，所有监听器都读到修正后的值；
 *   2. 请求拦截的伪造响应用 dispatchEvent（同时触发 onmessage 与 addEventListener），
 *      并打上合成标记，避免再次进入修正逻辑；
 *   3. pending 改为有界 Map + 定时清理（由 Scheduler 托管），
 *   4. 卸载时还原 window.WebSocket 并清理实例集合与定时器。
 */

import type { Disposable } from "../domain/disposable";
import type { LoggerPort, SchedulerPort } from "../domain/ports";
import { hostWindow } from "../platform/env";

export interface WebSocketHookOptions {
  targetURL?: string;
  enableRequestFix?: boolean;
  enableResponseFix?: boolean;
  /** 本地翻译：命中返回译文，未命中返回 null（放行给 AI） */
  translateFn?: (text: string) => string | null;
  /** AI 响应修正 */
  fixResponseFn?: (original: string, aiResult: string) => string;
  pendingTimeout?: number;
}

type PendingRequest = { original: string; timestamp: number };

const MAX_PENDING = 500;

export class WebSocketHook implements Disposable {
  private hooked = false;
  private originalWebSocket: typeof WebSocket | null = null;
  private pending = new Map<string | number, PendingRequest>();
  private instances = new Set<WebSocket>();
  private cleanupTimer: (() => void) | null = null;
  private autoId = 0;
  private options: Required<WebSocketHookOptions>;
  private scheduler: SchedulerPort;
  private logger: LoggerPort;

  constructor(
    options: WebSocketHookOptions,
    deps: { scheduler: SchedulerPort; logger: LoggerPort }
  ) {
    this.scheduler = deps.scheduler;
    this.logger = deps.logger;
    this.options = {
      targetURL: options.targetURL || "127.0.0.1:64002",
      enableRequestFix: options.enableRequestFix ?? true,
      enableResponseFix: options.enableResponseFix ?? true,
      translateFn: options.translateFn ?? (() => null),
      fixResponseFn: options.fixResponseFn ?? ((_, ai) => ai),
      pendingTimeout: options.pendingTimeout ?? 30000,
    };
  }

  get isHooked(): boolean {
    return this.hooked;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  get activeInstances(): number {
    return this.instances.size;
  }

  updateOptions(options: WebSocketHookOptions): void {
    this.options = { ...this.options, ...options };
  }

  install(): boolean {
    if (this.hooked) return false;
    const win = hostWindow();
    if (!win || typeof win.WebSocket === "undefined") return false;

    const self = this;
    const opts = this.options;
    this.originalWebSocket = win.WebSocket;
    const Original = this.originalWebSocket;

    class HookedWebSocket extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url as any, protocols as any);
        const urlStr = String(url);
        if (!urlStr.includes(opts.targetURL)) return;

        const ws = this as unknown as WebSocket;
        self.instances.add(ws);
        self.ensureCleanupTimer();

        // ---- 响应修正（原地改写 data，不打断事件传播）----
        ws.addEventListener("message", (event: MessageEvent) => {
          self.handleResponse(event, ws);
        });

        // ---- 请求拦截 ----
        const originalSend = ws.send.bind(ws);
        (ws as any).send = function (data: any, ...rest: any[]) {
          if (opts.enableRequestFix && typeof data === "string") {
            const intercepted = self.handleRequest(data);
            if (intercepted) {
              self.dispatchSynthetic(ws, intercepted);
              return;
            }
          }
          return (originalSend as any)(data, ...rest);
        };

        ws.addEventListener("close", () => {
          self.instances.delete(ws);
          if (self.instances.size === 0) self.clearCleanupTimer();
        });
      }
    }

    win.WebSocket = HookedWebSocket as unknown as typeof WebSocket;
    this.hooked = true;
    this.logger.info(
      `[WS] Hook 已安装 (target=${opts.targetURL}, reqFix=${opts.enableRequestFix}, respFix=${opts.enableResponseFix})`
    );
    return true;
  }

  uninstall(): boolean {
    if (!this.hooked || !this.originalWebSocket) return false;
    const win = hostWindow();
    if (win) win.WebSocket = this.originalWebSocket;
    this.originalWebSocket = null;
    this.hooked = false;
    this.pending.clear();
    this.instances.clear();
    this.clearCleanupTimer();
    return true;
  }

  dispose(): void {
    this.uninstall();
  }

  // ==================== 请求 ====================

  /** @returns 伪造的响应对象（拦截）或 null（放行） */
  private handleRequest(data: string): any | null {
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;

    const cmd = parsed.cmd ?? parsed.command;
    if (cmd !== "trs" && cmd !== "tr") return null;
    if (!Array.isArray(parsed.args) || parsed.args.length === 0) return null;

    const originalText: string = parsed.args[0];
    if (!originalText || typeof originalText !== "string") return null;

    const local = this.options.translateFn(originalText);
    if (!local || local === originalText) {
      this.rememberPending(parsed.id, originalText);
      return null;
    }
    return {
      id: parsed.id ?? Date.now(),
      ret: local,
      error: false,
      type: 1,
    };
  }

  private rememberPending(id: any, original: string): void {
    const key =
      typeof id === "number" || typeof id === "string" ? id : `__auto_${++this.autoId}`;
    if (this.pending.size >= MAX_PENDING) {
      const oldest = this.pending.keys().next().value;
      if (oldest !== undefined) this.pending.delete(oldest);
    }
    this.pending.set(key, { original, timestamp: Date.now() });
  }

  private takePending(id: any): PendingRequest | undefined {
    if (id !== undefined && id !== null && this.pending.has(id)) {
      const hit = this.pending.get(id)!;
      this.pending.delete(id);
      return hit;
    }
    // 无 id：退回最早的一条
    let bestKey: any;
    let best: PendingRequest | undefined;
    for (const [k, p] of this.pending) {
      if (!best || p.timestamp < best.timestamp) {
        best = p;
        bestKey = k;
      }
    }
    if (bestKey !== undefined) this.pending.delete(bestKey);
    return best;
  }

  // ==================== 响应 ====================

  private handleResponse(event: MessageEvent, _ws: WebSocket): void {
    if (!this.options.enableResponseFix) return;
    if ((event as any).__mtoolSynthetic) return; // 自己伪造的事件不再处理
    if (typeof event.data !== "string") return;

    let parsed: any;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object" || typeof parsed.ret !== "string") return;

    const pending = this.takePending(parsed.id);
    const original = pending?.original ?? "";
    const fixed = this.options.fixResponseFn(original, parsed.ret);
    if (!fixed || fixed === parsed.ret) return;

    parsed.ret = fixed;
    // 原地覆盖 data：所有监听器（含 onmessage）都会读到修正后的值
    try {
      Object.defineProperty(event, "data", {
        value: JSON.stringify(parsed),
        configurable: true,
      });
    } catch {
      // 极端情况下无法改写（宿主冻结了事件对象）→ 退化为合成事件
      this.dispatchSynthetic(_ws, parsed);
    }
  }

  private dispatchSynthetic(ws: WebSocket, payload: any): void {
    const event = new MessageEvent("message", { data: JSON.stringify(payload) });
    Object.defineProperty(event, "__mtoolSynthetic", { value: true });
    // setTimeout(0) 让调用方的 send() 先返回，语义更接近真实异步响应
    this.scheduler.timeout(() => {
      try {
        ws.dispatchEvent(event);
      } catch {
        /* 连接已关闭 */
      }
    }, 0);
  }

  // ==================== 清理 ====================

  private ensureCleanupTimer(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = this.scheduler.interval(() => this.cleanupPending(), 5000);
  }

  private clearCleanupTimer(): void {
    this.cleanupTimer?.();
    this.cleanupTimer = null;
  }

  private cleanupPending(): void {
    const now = Date.now();
    for (const [id, item] of this.pending) {
      if (now - item.timestamp > this.options.pendingTimeout) this.pending.delete(id);
    }
  }
}
