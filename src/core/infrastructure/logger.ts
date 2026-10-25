/**
 * infrastructure/logger.ts — 日志实现
 *
 *   1. 「普通缓冲 + 节流批量提交（默认 150ms）」，订阅者（UI）按需渲染；
 *   2. 一次 splice 批量裁剪；
 *   3. 统计（各级别条数）增量维护
 *   4. 相同文本短时间重复 → 合并计数（"…(x3)"）
 *   5. 控制台输出可关闭，且 warning 以上强制输出。
 */

import { LogLevel } from "../../typings/enum";

import type { LogEntry, LoggerPort } from "../domain/ports";

const LEVEL_ORDER: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  info: 1,
  success: 2,
  warning: 3,
  error: 4,
};

const CONSOLE_STYLE: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "color: #95a5a6",
  [LogLevel.INFO]: "color: #197dea",
  [LogLevel.SUCCESS]: "color: #2ecc71",
  [LogLevel.WARNING]: "color: #f39c12",
  [LogLevel.ERROR]: "color: #e74c3c",
};

interface PendingEntry extends LogEntry {
  repeat: number;
}

export interface LoggerOptions {
  maxCount?: number;
  /** UI 刷新节流间隔 */
  flushInterval?: number;
  consoleEnabled?: boolean;
}

export class RingLogger implements LoggerPort {
  private buffer: LogEntry[] = [];
  private pending: PendingEntry[] = [];
  private counters: Record<LogLevel, number>;
  private listeners = new Set<(entries: LogEntry[]) => void>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 0;
  private maxCount: number;
  private flushInterval: number;
  private consoleEnabled: boolean;
  private lastText = "";
  private lastAt = 0;

  constructor(options: LoggerOptions = {}) {
    this.maxCount = Math.max(10, options.maxCount ?? 50);
    this.flushInterval = options.flushInterval ?? 150;
    this.consoleEnabled = options.consoleEnabled ?? false;
    this.counters = { info: 0, warning: 0, error: 0, success: 0, debug: 0 };
  }

  // ==================== 写入 ====================

  log(text: unknown, level: LogLevel = LogLevel.INFO): void {
    const message = String(text ?? "");
    const now = Date.now();

    // 相同文本 800ms 内重复 → 合并
    const last = this.pending[this.pending.length - 1];
    if (last && last.text === message && now - this.lastAt < 800) {
      last.repeat++;
      return;
    }
    this.lastAt = now;
    this.lastText = message;

    const entry: PendingEntry = {
      id: ++this.nextId,
      text: message,
      level,
      timestamp: now,
      repeat: 1,
    };
    this.pending.push(entry);
    this.counters[level]++;

    if (this.consoleEnabled || LEVEL_ORDER[level] >= LEVEL_ORDER.warning) {
      this.print(message, level);
    }
    this.scheduleFlush();
  }

  info(t: unknown): void {
    this.log(t, LogLevel.INFO);
  }
  warn(t: unknown): void {
    this.log(t, LogLevel.WARNING);
  }
  error(t: unknown): void {
    this.log(t, LogLevel.ERROR);
  }
  debug(t: unknown): void {
    this.log(t, LogLevel.DEBUG);
  }
  success(t: unknown): void {
    this.log(t, LogLevel.SUCCESS);
  }

  // ==================== 订阅 ====================

  subscribe(listener: (entries: LogEntry[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.buffer);
    return () => this.listeners.delete(listener);
  }

  entries(): LogEntry[] {
    return this.buffer;
  }

  get stats(): Record<LogLevel | "total", number> {
    return { ...this.counters, total: this.buffer.length };
  }

  exportText(): string {
    return this.buffer.map((e) => `[${e.level}] ${e.text}`).join("\n");
  }

  setMaxCount(n: number): void {
    this.maxCount = Math.max(10, Math.floor(n) || 50);
    this.trim();
    this.scheduleFlush();
  }

  setConsoleEnabled(enabled: boolean): void {
    this.consoleEnabled = !!enabled;
  }

  clear(): void {
    this.pending = [];
    this.buffer = [];
    this.counters = { info: 0, warning: 0, error: 0, success: 0, debug: 0 };
    this.scheduleFlush();
  }

  dispose(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.listeners.clear();
  }

  // ==================== 内部 ====================

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushInterval);
  }

  private flush(): void {
    if (this.pending.length === 0) return;
    const batch: LogEntry[] = this.pending.map((p) => ({
      id: p.id,
      level: p.level,
      timestamp: p.timestamp,
      text: p.repeat > 1 ? `${p.text} (x${p.repeat})` : p.text,
    }));
    this.pending = [];
    this.buffer.push(...batch);
    this.trim();
    const snapshot = this.buffer;
    for (const l of this.listeners) {
      try {
        l(snapshot);
      } catch {
        /* 单个订阅者异常不影响其它 */
      }
    }
  }

  private trim(): void {
    const overflow = this.buffer.length - this.maxCount;
    if (overflow > 0) this.buffer.splice(0, overflow);
  }

  private print(text: string, level: LogLevel): void {
    try {
      console.log(`%c[MToolTranslatorPlugin] ${text}`, CONSOLE_STYLE[level]);
    } catch {
      /* 宿主禁用了 console */
    }
  }

  /** 兼容：返回最近一条文本（调试用） */
  get lastTextLogged(): string {
    return this.lastText;
  }
}
