/**
 * Hook 工具函数 — 统一方法劫持/还原
 *
 * 修复（Bug 修复）：
 *  - uninstallHook 原路径是 (window)[className][methodName]，
 *    但安装时挂的是 prototype，还原也必须走 prototype
 *  - 增加 installHook / uninstallHook 的调试日志
 *  - 支持引擎开关关闭时正确还原原函数
 */
import logger, { LogLevel } from '../logger';
const originalMethods = new Map<string, { className: string; methodName: string; original: any }>();

/**
 * 劫持某个类的原型方法
 * @param className  全局类名（如 'Bitmap', 'DataManager'）
 * @param methodName 方法名（如 'drawText', 'onLoad'）
 * @param hookFn     包装函数，接收 (original, ...args)，返回新的 args 数组
 */
export function hookPrototype(
  className: string,
  methodName: string,
  hookFn: (original: Function, ...args: any[]) => any[]
): void {
  const cls = (window as any)[className];
  if (!cls || !cls.prototype) {
    logger.addLog(`[Hook] ${className}.prototype 不存在，跳过 ${methodName}`, LogLevel.WARNING);
    return;
  }

  const original = cls.prototype[methodName];
  if (typeof original !== 'function') {
    logger.addLog(`[Hook] ${className}.${methodName} 不是函数，跳过`, LogLevel.WARNING);
    return;
  }

  // 防止重复 hook
  const key = `${className}.${methodName}`;
  if (originalMethods.has(key)) {
    logger.addLog(`[Hook] ${key} 已劫持，跳过重复安装`, LogLevel.DEBUG);
    return;
  }

  // 保存原始方法
  originalMethods.set(key, { className, methodName, original });

  cls.prototype[methodName] = function (...args: any[]) {
    try {
      const newArgs = hookFn.call(this, original.bind(this), ...args);
      if (Array.isArray(newArgs)) {
        return original.apply(this, newArgs);
      }
      return original.apply(this, args);
    } catch (e: any) {
      logger.addLog(`[Hook] ${key} 执行异常: ${e.message}`, LogLevel.ERROR);
      return original.apply(this, args);
    }
  };

  console.log(`[MToolTranslatorPlugin][Hook] ✅ ${key} 已劫持`);
}

/**
 * 还原某个类的原型方法
 * @param className  全局类名
 * @param methodName 方法名
 */
export function uninstallHook(className: string, methodName: string): boolean {
  const key = `${className}.${methodName}`;
  const saved = originalMethods.get(key);
  if (!saved) {
    logger.addLog(`[Hook] ${key} 无原始方法可还原`, LogLevel.DEBUG);
    return false;
  }

  const cls = (window as any)[className];
  if (cls && cls.prototype) {
    cls.prototype[methodName] = saved.original;
    originalMethods.delete(key);
    console.log(`[MToolTranslatorPlugin][Hook] ↩️ ${key} 已还原`);
    logger.addLog(`[Hook] ${key} 已还原`, LogLevel.INFO);
    return true;
  }

  return false;
}


/**
 * Hook 一个对象的 setter（用于属性赋值拦截）
 */
export function hookSetter(
  className: string,
  propertyName: string,
  hookFn: (originalValue: any, newValue: any) => any
): void {
  const cls = (window as any)[className];
  if (!cls || !cls.prototype) {
    logger.addLog(`[Hook] ${className} 不存在，跳过 setter ${propertyName}`, LogLevel.WARNING);
    return;
  }

  const descriptor = Object.getOwnPropertyDescriptor(cls.prototype, propertyName);
  const originalSetter = descriptor?.set;

  Object.defineProperty(cls.prototype, propertyName, {
    get: descriptor?.get,
    set: function (this: any, value: any) {
      try {
        const newValue = hookFn.call(this, originalSetter ? originalSetter.call(this, value) : undefined, value);
        if (originalSetter) {
          originalSetter.call(this, newValue);
        } else {
          // 如果没有原 setter，直接赋值到内部属性
          (this as any)[`_${propertyName}`] = newValue;
        }
      } catch (e: any) {
        logger.addLog(`[Hook] ${className}.${propertyName} setter 异常: ${e.message}`, LogLevel.ERROR);
        if (originalSetter) originalSetter.call(this, value);
      }
    },
    enumerable: descriptor?.enumerable ?? true,
    configurable: true,
  });

  console.log(`[MToolTranslatorPlugin][Hook] ✅ ${className}.${propertyName} setter 已劫持`);
}