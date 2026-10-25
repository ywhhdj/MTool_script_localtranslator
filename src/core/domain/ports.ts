/**
 * domain/ports.ts — 端口（接口）定义
 *
 * 内核各层只依赖这里的接口，具体实现由 infrastructure / platform 提供，
 * 在 container.ts 中完成装配。这样引擎层可脱离浏览器环境做单元测试，
 * 也避免了「内核直接 new 具体实现」造成的反向依赖。
 */
import type { LogLevel } from "../../typings/enum";
import type { Disposable } from "./disposable";

export interface LogEntry {
  id: number;
  text: string;
  level: LogLevel;
  timestamp: number;
}


/** 日志端口：内核写，UI 订阅 */
export interface LoggerPort {
  log(text: unknown, level?: LogLevel): void;
  info(text: unknown): void;
  warn(text: unknown): void;
  error(text: unknown): void;
  debug(text: unknown): void;
  success(text: unknown): void;
  setMaxCount(n: number): void;
  setConsoleEnabled(enabled: boolean): void;
  /** 订阅变更（节流后批量通知），返回取消函数 */
  subscribe(listener: (entries: LogEntry[]) => void): () => void;
  entries(): LogEntry[];
  clear(): void;
}

/** 键值存储端口（localStorage 或内存兜底） */
export interface KeyValueStorePort {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
  keys(prefix?: string): string[];
  readonly persistent: boolean;
}

/** 定时器端口：所有定时器必须经此创建，便于统一回收（防内存泄漏） */
export interface SchedulerPort extends Disposable {
  timeout(fn: () => void, ms: number): () => void;
  interval(fn: () => void, ms: number): () => void;
  debounce<T extends (...args: any[]) => void>(fn: T, ms: number): Debounced<T>;
  throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T & { cancel(): void };
  readonly size: number;
}

export interface Debounced<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;
  cancel(): void;
  flush(): void;
}

/** 指标端口：热路径上只做加法，避免遍历统计 */
export interface MetricsPort {
  inc(name: string, delta?: number): void;
  get(name: string): number;
  snapshot(): Record<string, number>;
  reset(): void;
}

/** 网络端口：与宿主 fetch 解耦，便于 mock 与避免被自身 Hook 二次处理 */
export interface HttpPort {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

/** 文本翻译端口（Hook 层只依赖这个能力，不认识 Translator 具体类） */
export interface TextTranslatorPort {
  translate(text: string): string;
}

/** 配置读取端口：内核只读普通值，不触碰响应式对象 */
export interface ConfigReaderPort {
  get<T = any>(key: string): T | undefined;
  subscribe(listener: (changed: string[]) => void): () => void;
}
