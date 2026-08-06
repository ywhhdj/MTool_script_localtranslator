import { reactive } from 'vue';
import config from '../config';

export enum LogLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  SUCCESS = 'success',
  DEBUG = 'debug'
}

export type LogFilter = LogLevel | 'all';

export type LogEntry = {
  id: number;
  text: string;
  level: LogLevel;
  timestamp: number;
}

class Logger {
  private maxLogCount: number;
  private logCallback: (text: string) => string;
  private _id = 0;
  log_queue = reactive<LogEntry[]>([]);

  constructor(maxLogCount?: number) {
    this.maxLogCount = maxLogCount ?? config.user.maxLogCount?.default ?? 50;
    this.logCallback = (text: string) =>
      `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${text}`;
  }

  addLog(text: any, level: LogLevel = LogLevel.INFO) {
    const entry: LogEntry = {
      id: ++this._id,
      text: this.logCallback(String(text)),
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
    if (filter === 'all') return [...this.log_queue];
    return this.log_queue.filter((e: LogEntry) => e.level === filter);
  }

  getStats() {
    const counts = { info: 0, warning: 0, error: 0, success: 0, debug: 0 };
    for (const e of this.log_queue) counts[e.level]++;
    return { ...counts, total: this.log_queue.length };
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
    console.log(`%c[MTool] ${text}`, styles[level]);
  }

  setMaxCount(n: number) {
    this.maxLogCount = Math.max(10, n);
    this._trim();
  }
}

const logger = new Logger();
export default logger;