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