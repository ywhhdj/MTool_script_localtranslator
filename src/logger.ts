import Config from "./config";

interface LogLevelItem {
  text: string;
  yellow: string;
}
export enum LogLevel {
  info = 'info',
  warning = 'warning',
  error = 'error',
  success = 'success',
}

export const LogLevelInfo: Record<LogLevel, LogLevelItem> = {
  [LogLevel.info]: {
    text: 'info',
    yellow: '#197dea',
  },
  [LogLevel.warning]: {
    text: 'warning',
    yellow: '#f39c12',
  },
  [LogLevel.error]: {
    text: 'error',
    yellow: '#e74c3c',
  },
  [LogLevel.success]: {
    text: 'success',
    yellow: '#2ecc71',
  },
};

class LocalTranslatorLogger {
  logElement: HTMLDivElement | null = null;
  maxLogCount: number;
  logCallback: ((text: string) => string) | null = null;
  logFragment: DocumentFragment | null = null;

  constructor(maxLogCount: number = 10) {
    this.maxLogCount = maxLogCount;
  }

  addLog(text: any, level: LogLevel = LogLevel.info) {
    this.addLogs([text], level);
  }

  addLogs(texts: any[], level: LogLevel = LogLevel.info) {
    if (!this.logElement) return;
    if (!this.logFragment) this.logFragment = document.createDocumentFragment();
    texts.forEach(text => {
      const logEntry = document.createElement('div');
      logEntry.className = 'local-translator-element-log';
      logEntry.id = `local-translator-element-log-${level}`;
      if (this.logCallback) logEntry.textContent = this.logCallback(text);
      else logEntry.textContent = text;
      this.logFragment?.appendChild(logEntry);
    });
    this.logElement?.appendChild(this.logFragment);
    this.logFragment = null;
    const count = this.logElement?.childElementCount || 0;
    if (count > this.maxLogCount) {
      const removeCount = count - this.maxLogCount;
      for (let i = 0; i < removeCount; i++) {
        if (this.logElement.firstElementChild) {
          this.logElement.removeChild(this.logElement.firstElementChild);
        }
      }
    }
    if (this.logElement.style.display !== 'none') {
      this.logElement.scrollTop = this.logElement.scrollHeight;
    }
  }

  clearLog() {
    if (this.logElement) this.logElement.innerHTML = '';
  }

  destroy() {
    this.logElement = null;
    this.logCallback = null;
    this.logElement = null;
    if (this.logFragment) {
      this.logFragment = null;
      this.logFragment = null;
    }
  }
}
const logger = new LocalTranslatorLogger(Config.maxLogCount);
export default logger;
