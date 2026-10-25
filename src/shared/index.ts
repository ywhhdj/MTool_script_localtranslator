/**
 * shared/ — 表现层共享工具（无内核依赖，UI 与导出逻辑共用）
 */

import { onScopeDispose, ref, type Ref } from "vue";

export function safeJSONParse<T = any>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export { getGameName, timestampFileName } from "../core/io/files";
export { downloadJson, downloadDelimited, downloadText } from "../core/io/files";
export { getFileType, isSupportedFile } from "../core/io/files";
export { safeJSONParse as parseJSON };

/** 兼容旧 API：按格式把数据下载成文件 */
export function download(
  data: any,
  fileName: string,
  type: "csv" | "json" | "tsv" | "txt" = "json"
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      if (type === "txt") {
        downloadText(String(data ?? ""), fileName, "text/plain");
      } else if (type === "json") {
        downloadJson(data, fileName);
      } else {
        const rows = Array.isArray(data) ? (data as Array<Array<string | number>>) : [[String(data)]];
        downloadDelimited(rows, fileName, type === "csv" ? "," : "\t");
      }
      resolve(true);
    } catch (e) {
      reject(e);
    }
  });
}

/** 保存 JSON 到文件 */
export function saveJSONFile(data: Record<string, any>, fileName: string): Promise<void> {
  return Promise.resolve(downloadJson(data, `${fileName}.json`));
}

/** 带 cancel 的防抖（UI 输入类场景） */
export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  }) as T & { cancel(): void };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

/**
 * 单一全局心跳：所有需要「定期刷新」的组件共享一个 setInterval。
 *
 * 修复点（相对原实现）：原 useHeartbeat 用模块级 timer 且永不清理，
 * 每个组件各自调用也只是复用同一个永不停止的 interval；
 * 现在改为引用计数：最后一个使用者卸载时才真正停表。
 */

const tick = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
let subscribers = 0;

export function useHeartbeat(intervalMs: number = 1000): Ref<number> {
  subscribers++;
  if (!timer) {
    timer = setInterval(() => {
      tick.value++;
    }, intervalMs);
  }
  if (typeof onScopeDispose === "function") {
    try {
      onScopeDispose(() => releaseHeartbeat());
    } catch {
      /* 非组件作用域调用时忽略 */
    }
  }
  return tick;
}

export function releaseHeartbeat(): void {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}
