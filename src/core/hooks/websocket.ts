import logger, { LogLevel } from '../logger';
import translator from '../translator';
import { isResourcePath, safeJSONParse } from '../../utils';
import config from '../../config';

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
  /** 正在派发伪造消息：用于避免「修复→重派发→再次触发监听器→再次修复」的死循环 */
  private dispatching: boolean = false;
  /** 请求无 id 时的自增兜底编号 */
  private autoId = 0;

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

    if (config.debug) {
      console.log(`[MToolTranslatorPlugin][WS] ✅ WebSocket Hook 安装中 (target=${opts.targetURL})`);
    }

    const HookedWebSocket = class extends this.OriginalWebSocket {
      constructor(url: string | URL, ...args: any[]) {
        super(url, ...args);
        const urlStr = String(url);
        const isTarget = urlStr.includes(opts.targetURL);

        if (config.debug) {
          console.log(`[MToolTranslatorPlugin][WS] 🔌 连接: ${urlStr}${isTarget ? ' [目标]' : ''}`);
        }

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
              if (config.debug) {
                console.log(`[MToolTranslatorPlugin][WS] 🚫 send 已拦截: ${data.slice(0, 40)}`);
              }
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

    if (config.debug) {
      console.log('[MToolTranslatorPlugin][WS] ↩️ WebSocket Hook 已还原');
    }
    logger.addLog('[WS] Hook 已还原', LogLevel.INFO);
    return true;
  }

  // ==================== 请求拦截 ====================

  private _interceptRequest(data: string, _onIntercept: (ret: any) => void): boolean {
    let parsed: any;
    try {
      parsed = safeJSONParse(data);
    } catch { return false; }
    // 非对象 / 解析失败（safeJSONParse 返回 null）时直接放行，避免读取属性抛错
    if (!parsed || typeof parsed !== 'object') return false;

    // 支持 cmd: 'trs' 和 'tr' 两种格式
    const cmd = parsed.cmd || parsed.command;
    if (cmd !== 'trs' && cmd !== 'tr') return false;
    if (!Array.isArray(parsed.args) || parsed.args.length === 0) return false;

    const originalText: string = parsed.args[0];
    if (!originalText || typeof originalText !== 'string') return false;

    // 资源路径放行
    if (isResourcePath(originalText)) {
      if (config.debug) {
        console.log(`[MToolTranslatorPlugin][WS] ⏭️ 资源放行: ${originalText}`);
      }
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

      if (config.debug) {
        console.log(`[MToolTranslatorPlugin][WS] ✅ 本地翻译命中: "${originalText.slice(0, 20)}..." → "${localResult.slice(0, 30)}..."`);
      }

      // 异步派发伪造响应
      setTimeout(() => {
        this._dispatchFakeMessage(fakeResponse);
      }, 0);

      return true; // 拦截，不发网络请求
    }

    // 未命中本地 → 记录 pending，等响应回来再修复。
    // 无 id 或同毫秒多发时用自增 id，避免 Date.now() 撞车互相覆盖
    const reqId = (typeof parsed.id === 'number' || typeof parsed.id === 'string')
      ? parsed.id
      : `__auto_${++this.autoId}`;
    this.pendingMap.set(reqId, {
      original: originalText,
      timestamp: Date.now(),
      resolve: () => { },
    });

    if (config.debug) {
      console.log(`[MToolTranslatorPlugin][WS] ⏳ 未命中本地，等待 AI 响应: "${originalText.slice(0, 20)}..."`);
    }
    return false; // 放行到网络
  }

  /** 取出并移除一条 pending：优先按 id 命中，无 id 时退回最早的一条 */
  private _takePending(id: any): PendingRequest | undefined {
    if (id !== undefined && id !== null && this.pendingMap.has(id)) {
      const hit = this.pendingMap.get(id)!;
      this.pendingMap.delete(id);
      return hit;
    }
    let bestKey: any = undefined;
    let best: PendingRequest | undefined;
    for (const [k, p] of this.pendingMap) {
      if (!best || p.timestamp < best.timestamp) {
        best = p;
        bestKey = k;
      }
    }
    if (bestKey !== undefined) this.pendingMap.delete(bestKey);
    return best;
  }

  // ==================== 响应拦截 ====================

  private _interceptResponse(event: MessageEvent): void {
    // 自己派发的伪造事件不再二次处理，否则会无限重派发
    if (this.dispatching) return;
    if (typeof event.data !== 'string') return;

    let parsed: any;
    try {
      parsed = safeJSONParse(event.data);
    } catch { return; }
    if (!parsed || typeof parsed !== 'object') return;
    if (typeof parsed.ret !== 'string') return;

    const pending = this._takePending(parsed.id);
    const original = pending?.original || '';

    const fixed = this.options.fixResponseFn(original, parsed.ret || '');

    // 与我们无关、且无需修正的响应直接放行，避免无意义的重新派发
    if (!pending && fixed === parsed.ret) return;

    if (fixed && fixed !== parsed.ret && config.debug) {
      console.log(`[MToolTranslatorPlugin][WS] ✏️ AI 译文已修复: "${parsed.ret.slice(0, 20)}..." → "${fixed.slice(0, 30)}..."`);
      logger.addLog(
        `[WS] AI 译文修复: "${parsed.ret.slice(0, 20)}..." → "${fixed.slice(0, 30)}..."`,
        LogLevel.DEBUG
      );
    }

    // 无论是否修复，都更新 ret 并重新派发
    parsed.ret = fixed || parsed.ret;

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
    if (!ws) return;

    // MessageEvent 派发是同步的，期间置位可阻止本实例的监听器再次拦截
    this.dispatching = true;
    try {
      if ((ws as any).onmessage) {
        (ws as any).onmessage(event);
      } else {
        // 如果没有 onmessage，手动 dispatch
        ws.dispatchEvent(event);
      }
    } finally {
      this.dispatching = false;
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
    if (cleaned > 0 && config.debug) {
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
