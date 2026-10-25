/**
 * core/index.ts — 内核出口（Facade）
 *
 * 表现层只允许从这里 import 内核能力，不直接触碰具体模块文件，
 * 这样内核内部重构（拆文件、换实现）不会波及 UI。
 *
 * 这里同时提供「面向 UI 的适配」：
 *   - logger：把内核的订阅式日志包装成 Vue 响应式队列（UI 直接 v-for）；
 *   - LogLevel：UI 使用的日志级别常量。
 */

import { reactive } from "vue";
import { container } from "./container";
import type { LogEntry } from "./domain/ports";
import { downloadDelimited, downloadJson } from "./io/files";
import { getGameName, timestampFileName } from "./io/files";
import type { ExportFormat } from "./domain/types";
import { LogLevel } from "../typings/enum";

export const { config, translator, aiTranslator, mootHook, cheat, hookManager, storage, metrics } =
  container;

/** UI 兼容用的缓存对象（统计/清理） */
export const cache = container.translator.cache;

export type { LogEntry };
export type LogFilter = LogLevel | "total";
export { LANG_LABEL as Lang } from "./config/config-store";

const logQueue = reactive<LogEntry[]>([]);
container.logger.subscribe((entries) => {
  logQueue.splice(0, logQueue.length, ...entries);
});

export const logger = {
  /** 响应式日志队列（UI 直接渲染） */
  log_queue: logQueue,
  addLog(text: unknown, level: LogLevel = LogLevel.INFO): void {
    container.logger.log(text, level);
  },
  addLogs(texts: unknown[], level: LogLevel = LogLevel.INFO): void {
    for (const t of texts) container.logger.log(t, level);
  },
  clearLog(): void {
    container.logger.clear();
  },
  exportLogs(): string {
    return container.logger.exportText();
  },
  get stats() {
    return container.logger.stats;
  },
  setMaxCount(n: number): void {
    container.logger.setMaxCount(n);
  },
  setConsoleEnabled(enabled: boolean): void {
    container.logger.setConsoleEnabled(enabled);
  },
};

/** 导出翻译数据（json / csv / tsv） */
export async function exportTranslationData(format: ExportFormat = "json"): Promise<void> {
  const { data, fileName } = translator.exportTranslationData(format);
  if (format === "json") downloadJson(data, fileName);
  else downloadDelimited(data as string[][], fileName, format === "csv" ? "," : "\t");
}

export async function exportAIFixRules(format: "json" | "csv" = "json"): Promise<void> {
  const { data, fileName } = translator.exportAIFixRules(format);
  if (format === "json") downloadJson(data, fileName);
  else downloadDelimited(data as string[][], fileName, ",");
}

export { getGameName, timestampFileName, downloadJson, downloadDelimited };
export { GENERIC_SCRIPT_PRESET } from "./cheat/engines/generic";
export { container };
export default container;
