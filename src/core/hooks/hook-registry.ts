/**
 * hooks/hook-registry.ts — 原型方法劫持注册表
 *
 * 一处实现，两处复用（翻译 Hook 改入参、修改器 Hook 改返回值）。
 *
 *   1. 「点路径」解析与还原；
 *   2. 幂等表集中管理，uninstallAll() 可完整还原，解决「倍率叠加放大」；
 *   3. 包装函数抛异常时无条件回落原始实现
 */

import { resolveGlobal } from "../platform/env";
import type { Disposable } from "../domain/disposable";

export type PrototypeWrapper = (
  original: Function,
  self: any,
  args: any[]
) => any;

interface HookRecord {
  path: string;
  method: string;
  original: Function;
  proto: any;
}

export class PrototypeHookRegistry implements Disposable {
  private records = new Map<string, HookRecord>();

  get size(): number {
    return this.records.size;
  }

  list(): string[] {
    return Array.from(this.records.keys());
  }

  has(path: string, method: string): boolean {
    return this.records.has(`${path}.${method}`);
  }

  /** 目标方法是否存在（能力检测用） */
  static exists(path: string, method: string): boolean {
    const cls = resolveGlobal(path);
    if (!cls || !cls.prototype) return false;
    return typeof cls.prototype[method] === "function";
  }

  /**
   * 劫持一个原型方法。
   * @returns 是否成功；已劫持 / 目标不存在时返回 false（保证幂等）
   */
  hook(path: string, method: string, wrapper: PrototypeWrapper): boolean {
    const cls = resolveGlobal(path);
    if (!cls || !cls.prototype) return false;
    const original = cls.prototype[method];
    if (typeof original !== "function") return false;

    const key = `${path}.${method}`;
    if (this.records.has(key)) return false;

    this.records.set(key, { path, method, original, proto: cls.prototype });

    cls.prototype[method] = function (this: any, ...args: any[]) {
      try {
        return wrapper(original.bind(this), this, args);
      } catch (e) {
        console.warn(`[MToolTranslatorPlugin][Hook] ${key} 执行异常:`, e);
        return original.apply(this, args);
      }
    };
    return true;
  }

  unhook(path: string, method: string): boolean {
    const key = `${path}.${method}`;
    const record = this.records.get(key);
    if (!record) return false;
    try {
      record.proto[record.method] = record.original;
    } catch {
      /* 原型被冻结时忽略 */
    }
    this.records.delete(key);
    return true;
  }

  /** 还原全部，返回还原数量 */
  dispose(): number {
    const count = this.records.size;
    for (const record of Array.from(this.records.values())) {
      this.unhook(record.path, record.method);
    }
    return count;
  }
}
