/**
 * infrastructure/storage.ts — 持久化端口实现
 *
 *   1. 所有 key 统一加前缀，卸载时可精确清理「自己的」数据，不误删游戏存档；
 *   2. localStorage 不可用 / 超配额（QuotaExceededError）时不再抛异常刷屏，
 *      而是降级到内存存储，并只告警一次；
 *   3. 写入大字符串前预估大小，超限直接拒绝并告警，避免整页卡顿。
 */

import type { KeyValueStorePort } from "../domain/ports";

export const STORAGE_PREFIX = "MToolTranslator:";
/** 单次写入上限（字符数）。localStorage 通常 5MB，留出余量 */
const MAX_VALUE_CHARS = 1_500_000;

export class SafeStorage implements KeyValueStorePort {
  private warned = new Set<string>();
  private memory = new Map<string, string>();
  private backend: Storage | null;
  private prefix: string;

  constructor(prefix: string = STORAGE_PREFIX, backend?: Storage | null) {
    this.prefix = prefix;
    this.backend =
      backend !== undefined
        ? backend
        : (() => {
            try {
              if (typeof localStorage === "undefined") return null;
              // Safari 隐私模式下 setItem 会直接抛错，先探测
              const probe = `${prefix}__probe__`;
              localStorage.setItem(probe, "1");
              localStorage.removeItem(probe);
              return localStorage;
            } catch {
              return null;
            }
          })();
  }

  get persistent(): boolean {
    return this.backend !== null;
  }

  get(key: string): string | null {
    const k = this.prefix + key;
    if (this.backend) {
      try {
        const v = this.backend.getItem(k);
        return v === null ? (this.memory.get(k) ?? null) : v;
      } catch {
        return this.memory.get(k) ?? null;
      }
    }
    return this.memory.get(k) ?? null;
  }

  set(key: string, value: string): boolean {
    const k = this.prefix + key;
    if (value.length > MAX_VALUE_CHARS) {
      this.warnOnce(
        "quota",
        `[Storage] ${key} 体积过大（${value.length} 字符），已跳过写入`
      );
      return false;
    }
    if (!this.backend) {
      this.memory.set(k, value);
      return false;
    }
    try {
      this.backend.setItem(k, value);
      this.memory.delete(k);
      return true;
    } catch (e: any) {
      this.warnOnce("write", `[Storage] 写入失败 ${key}: ${e?.message ?? e}`);
      this.memory.set(k, value);
      return false;
    }
  }

  remove(key: string): void {
    const k = this.prefix + key;
    this.memory.delete(k);
    if (!this.backend) return;
    try {
      this.backend.removeItem(k);
    } catch {
      /* ignore */
    }
  }

  keys(prefix: string = ""): string[] {
    const full = this.prefix + prefix;
    const out = new Set<string>();
    for (const k of this.memory.keys()) {
      if (k.startsWith(full)) out.add(k.slice(this.prefix.length));
    }
    if (this.backend) {
      try {
        for (let i = 0; i < this.backend.length; i++) {
          const k = this.backend.key(i);
          if (k && k.startsWith(full)) out.add(k.slice(this.prefix.length));
        }
      } catch {
        /* ignore */
      }
    }
    return Array.from(out);
  }

  clearOwn(): number {
    const list = this.keys();
    for (const k of list) this.remove(k);
    this.memory.clear();
    return list.length;
  }

  private warnOnce(tag: string, message: string): void {
    if (this.warned.has(tag)) return;
    this.warned.add(tag);
    console.warn("[MToolTranslatorPlugin]", message);
  }
}

/** 纯内存实现：测试 / 无 localStorage 环境 */
export class MemoryStorage implements KeyValueStorePort {
  private map = new Map<string, string>();
  readonly persistent = false;
  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string): boolean {
    this.map.set(key, value);
    return true;
  }
  remove(key: string): void {
    this.map.delete(key);
  }
  keys(prefix: string = ""): string[] {
    return Array.from(this.map.keys()).filter((k) => k.startsWith(prefix));
  }
}
