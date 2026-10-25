/**
 * patch.ts — 修改器专用原型补丁工具
 *
 * 与 core/hooks/utils.ts 的 hookPrototype 的区别：
 *   1. 支持「改写返回值」：hookPrototype 只能替换入参，而 paramBase / paramMax /
 *      dropItemRate / maxLevel 这类必须改返回值，否则无法实现倍率修改
 *   2. 支持点路径解析：'Game_Actor'、'PIXI.Text' 均可
 *   3. 幂等：同一方法不会重复 patch，避免套娃放大倍率
 *   4. 可完整还原：保存原始方法引用，unpatchAll() 后行为与注入前一致
 */

import logger, { LogLevel } from "../logger";
import config from "../../config";

type PatchRecord = {
  key: string;
  path: string;
  method: string;
  original: Function;
};

const patches = new Map<string, PatchRecord>();

/** 解析全局对象路径，支持 'Game_Party' 与 'PIXI.Text' 这类点路径 */
function resolveGlobal(path: string): any {
  if (!path) return undefined;
  return path
    .split(".")
    .reduce<any>(
      (acc, key) => (acc === null || acc === undefined ? undefined : acc[key]),
      window as any
    );
}

/**
 * 补丁包装函数
 * @param original 已绑定 this 的原始方法
 * @param self     当前实例
 * @param args     原始入参数组
 * @returns 该方法的最终返回值
 */
export type PatchWrapper = (original: Function, self: any, args: any[]) => any;

/** 目标方法是否存在（用于能力检测，避免对不存在的原型打补丁） */
export function hasMethod(path: string, method: string): boolean {
  const cls = resolveGlobal(path);
  if (!cls || !cls.prototype) return false;
  return typeof cls.prototype[method] === "function";
}

/**
 * 给原型方法打补丁
 * @returns 是否成功（目标不存在或已打过补丁时返回 false）
 */
export function patchMethod(
  path: string,
  method: string,
  wrapper: PatchWrapper
): boolean {
  const cls = resolveGlobal(path);
  if (!cls || !cls.prototype) {
    logger.addLog(
      `[Cheat] ${path}.prototype 不存在，跳过 ${method}`,
      LogLevel.DEBUG
    );
    return false;
  }

  const original = cls.prototype[method];
  if (typeof original !== "function") {
    logger.addLog(`[Cheat] ${path}.${method} 不是函数，跳过`, LogLevel.DEBUG);
    return false;
  }

  const key = `${path}.${method}`;
  // 幂等：已打过补丁则跳过，防止倍率被叠加放大
  if (patches.has(key)) {
    if (config.debug) {
      console.log(`[MToolTranslatorPlugin][Cheat] ${key} 已注入，跳过`);
    }
    return false;
  }

  patches.set(key, { key, path, method, original });

  cls.prototype[method] = function (...args: any[]) {
    try {
      return wrapper(original.bind(this), this, args);
    } catch (e: any) {
      // 修改器绝不能把游戏搞崩：异常时无条件回落原始实现
      logger.addLog(`[Cheat] ${key} 执行异常: ${e.message}`, LogLevel.ERROR);
      return original.apply(this, args);
    }
  };

  if (config.debug) {
    console.log(`[MToolTranslatorPlugin][Cheat] ✅ ${key} 已注入`);
  }
  return true;
}

/** 还原单个补丁 */
export function unpatchMethod(path: string, method: string): boolean {
  const key = `${path}.${method}`;
  const record = patches.get(key);
  if (!record) return false;

  const cls = resolveGlobal(path);
  if (cls && cls.prototype) {
    cls.prototype[method] = record.original;
  }
  patches.delete(key);

  if (config.debug) {
    console.log(`[MToolTranslatorPlugin][Cheat] ↩️ ${key} 已还原`);
  }
  return true;
}

/** 还原全部补丁，返回还原数量 */
export function unpatchAll(): number {
  const count = patches.size;
  for (const record of Array.from(patches.values())) {
    unpatchMethod(record.path, record.method);
  }
  patches.clear();
  return count;
}

export function isPatched(path: string, method: string): boolean {
  return patches.has(`${path}.${method}`);
}

/** 当前已注入的方法清单 */
export function patchedList(): string[] {
  return Array.from(patches.keys());
}
