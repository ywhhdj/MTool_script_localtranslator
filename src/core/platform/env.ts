/**
 * platform/env.ts — 宿主环境探测与全局对象访问
 *
 * 唯一允许直接触碰 window / navigator / document 的地方。
 * 其它层需要宿主能力时一律从这里取（可注入替换，便于测试）。
 */

import type { HttpPort } from "../domain/ports";

type AnyWindow = Window & typeof globalThis & Record<string, any>;

export function hostWindow(): AnyWindow | null {
  return typeof window !== "undefined" ? (window as AnyWindow) : null;
}

export function hasWindow(): boolean {
  return typeof window !== "undefined";
}

export function hasDocument(): boolean {
  return typeof document !== "undefined";
}

/**
 * 解析全局对象路径：'Bitmap' / 'PIXI.Text' / 'Phaser.GameObjects.Text'
 * 不存在时返回 undefined，不抛错。
 */
export function resolveGlobal(path: string): any {
  if (!path) return undefined;
  const w = hostWindow();
  if (!w) return undefined;
  return path
    .split(".")
    .reduce<any>(
      (acc, key) => (acc === null || acc === undefined ? undefined : acc[key]),
      w
    );
}

export function hasGlobal(path: string): boolean {
  return resolveGlobal(path) !== undefined;
}

/**
 * 插件自身发起的请求必须走「安装 Hook 之前」的原始 fetch，
 * 不受任何 Hook 影响。
 */
function captureRawFetch(): typeof fetch {
  if (typeof fetch === "undefined") {
    return (() => Promise.reject(new Error("fetch 不可用"))) as unknown as typeof fetch;
  }
  return fetch.bind(typeof window !== "undefined" ? window : undefined) as typeof fetch;
}

const rawFetchFn = captureRawFetch();

export const rawHttp: HttpPort = {
  fetch: (input, init) => rawFetchFn(input as any, init),
};

/** Node 环境（MTool 打包脚本里可能以 CommonJS 方式加载） */
export function isNodeRuntime(): boolean {
  return (
    typeof module !== "undefined" &&
    !!(module as any).exports &&
    typeof (globalThis as any).require === "function"
  );
}

export function requireOptional(name: string): any {
  if (!isNodeRuntime()) return undefined;
  try {
    return (globalThis as any).require(name);
  } catch {
    return undefined;
  }
}
