import logger, { LogLevel } from './logger';
import {
  hookBitmap,
  hookCanvas,
  hookRPGMaker,
  hookPixiJS,
  hookCocos,
  unhookBitmap,
  unhookCanvas,
  unhookRPGMaker,
  unhookPixiJS,
  unhookCocos,
  hookPhaser,
  unhookPhaser,
} from './hooks/engine';
import { hookXHR, unhookXHR, hookFetch, unhookFetch } from './hooks/network';
import { EngineType } from '../typings/enum';
import { hookPrototype } from './hooks/utils';
import config from '../config';

const installedEngines = new Set<string>();

const JP_TEXT_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;

export function getInstalledEngines(): string[] {
  return Array.from(installedEngines);
}

export function isEngineInstalled(engine: string): boolean {
  return installedEngines.has(engine);
}

export function installEngineHooks(
  callback: (text: string) => any,
  cfg: Record<EngineType, boolean>,
  options?: {
    xhrOptions?: Options.XHRHookOptions;
  }
) {
  if (config.debug) {
    console.log('[MToolTranslatorPlugin][HookManager] 安装引擎 Hooks', cfg);
  }

  // ---- Bitmap ----
  if (cfg[EngineType.Bitmap]) {
    if (!isEngineInstalled('Bitmap')) {
      hookBitmap(callback);
      installedEngines.add('Bitmap');
    }
  } else {
    if (isEngineInstalled('Bitmap')) {
      unhookBitmap();
      installedEngines.delete('Bitmap');
    }
  }

  // ---- Canvas 2D ----
  if (cfg[EngineType.Canvas2D]) {
    if (!isEngineInstalled('Canvas2D')) {
      hookCanvas(callback);
      installedEngines.add('Canvas2D');
    }
  } else {
    if (isEngineInstalled('Canvas2D')) {
      unhookCanvas();
      installedEngines.delete('Canvas2D');
    }
  }

  // ---- RPG Maker ----
  if (cfg[EngineType.RPGMaker]) {
    if (!isEngineInstalled('RPGMaker')) {
      hookRPGMaker(callback);
      installedEngines.add('RPGMaker');
    }
  } else {
    if (isEngineInstalled('RPGMaker')) {
      unhookRPGMaker();
      installedEngines.delete('RPGMaker');
    }
  }

  // ---- PixiJS ----
  if (cfg[EngineType.PixiJS]) {
    if (!isEngineInstalled('PixiJS')) {
      hookPixiJS(callback);
      installedEngines.add('PixiJS');
    }
  } else {
    if (isEngineInstalled('PixiJS')) {
      unhookPixiJS();
      installedEngines.delete('PixiJS');
    }
  }

  // ---- Cocos2d ----
  if (cfg[EngineType.Cocos2d]) {
    if (!isEngineInstalled('Cocos2d')) {
      hookCocos(callback);
      installedEngines.add('Cocos2d');
    }
  } else {
    if (isEngineInstalled('Cocos2d')) {
      unhookCocos();
      installedEngines.delete('Cocos2d');
    }
  }

  if (cfg[EngineType.Phaser]) {
    if (!isEngineInstalled('Phaser')) {
      hookPhaser(callback);
      installedEngines.add('Phaser');
    }
  } else {
    if (isEngineInstalled('Phaser')) {
      unhookPhaser();
      installedEngines.delete('Phaser');
    }
  }

  // ---- XHR ----
  if (cfg[EngineType.XHR]) {
    if (!isEngineInstalled('XHR')) {
      hookXHR(
        options?.xhrOptions || {},
        callback
      );
      installedEngines.add('XHR');
    }
  } else {
    if (isEngineInstalled('XHR')) {
      unhookXHR();
      installedEngines.delete('XHR');
    }
  }

  // ---- Fetch ----
  if (cfg[EngineType.Fetch]) {
    if (!isEngineInstalled('Fetch')) {
      hookFetch({
        jsonOnly: true,
        transformResponse: (body: any, _) => {
          // 对 JSON 响应中的字符串字段做翻译
          if (typeof body === 'string') {
            const result = callback(body);
            if (Array.isArray(result) && typeof result[0] === 'string') {
              return result[0];
            }
            return result;
          }
          if (body && typeof body === 'object') {
            const translated: any = Array.isArray(body) ? [] : {};
            const processObj = (obj: any, target: any) => {
              for (const key of Object.keys(obj)) {
                const val = obj[key];
                if (typeof val === 'string' && val.length >= 2) {
                  const newArgs = callback(val);
                  target[key] = Array.isArray(newArgs) ? newArgs[0] : newArgs;
                } else if (typeof val === 'object' && val !== null) {
                  target[key] = Array.isArray(val) ? [] : {};
                  processObj(val, target[key]);
                } else {
                  target[key] = val;
                }
              }
            };
            processObj(body, translated);
            return translated;
          }
          return body;
        },
      });
      installedEngines.add('Fetch');
    }
  } else {
    if (isEngineInstalled('Fetch')) {
      unhookFetch();
      installedEngines.delete('Fetch');
    }
  }

  // ---- WebSocket ----
  if (cfg[EngineType.WebSocket]) {
    if (!isEngineInstalled('WebSocket')) {
      // WebSocket 由 translator 内部的 mootHook/wsHook 管理
      // 这里仅记录状态
      installedEngines.add('WebSocket');
      console.log('[MToolTranslatorPlugin][HookManager] WebSocket 由 Moot/WS 模块管理');
    }
  } else {
    installedEngines.delete('WebSocket');
  }
  if (config.debug) {
    console.log(`[MToolTranslatorPlugin][HookManager] 当前已安装: ${getInstalledEngines().join(', ') || '无'}`);
  }
}

export function uninstallAllEngineHooks(): void {
  if (config.debug) {
    console.log('[MToolTranslatorPlugin][HookManager] 卸载所有引擎 Hooks');
  }
  unhookBitmap();
  unhookCanvas();
  unhookRPGMaker();
  unhookPixiJS();
  unhookCocos();
  unhookPhaser();
  unhookXHR();
  unhookFetch();
  installedEngines.clear();
  logger.addLog('所有引擎 Hook 已卸载并还原', LogLevel.INFO);
}



// ==================== RPG Maker 预翻译 ====================

export function hookRPGMakerPreTranslate(callback: (text: string) => string): void {
  if (typeof window.DataManager === 'undefined') {
    logger.addLog('DataManager 不可用，预翻译 Hook 跳过', LogLevel.WARNING);
    return;
  }

  hookPrototype(
    'DataManager',
    'onLoad',
    function (this: any, _, ...args: any[]) {
      const object = args[0];
      // 原地翻译：不再整体深拷贝，避免大 $data 的一次性内存/时间峰值，
      // 同时保持对象引用不变（游戏内部缓存的引用不会失效）
      if (object && typeof object === 'object') {
        deepTranslateInPlace(object, callback);
      }
      return args;
    }
  );

  console.log('[MToolTranslatorPlugin][HookManager] ✅ RPG Maker 预翻译 Hook 已安装');
  logger.addLog('RPG Maker 预翻译 Hook 已安装', LogLevel.SUCCESS);
}

// ==================== 深度翻译（原地修改 + 返回值）====================

const NUMERIC_OR_EMPTY = /^[\d０-９\s\-+\.\/]+$/;
const MAX_DEEP_DEPTH = 12;

function isTranslatableString(s: string): boolean {
  return s.length >= 2 && !NUMERIC_OR_EMPTY.test(s) && !s.startsWith('\x1b') && !s.startsWith('\u001b');
}

/**
 * 深度翻译（原地修改，返回同一对象）
 * 带 WeakSet 循环引用保护与深度上限，避免自引用数据结构导致栈溢出
 */
function deepTranslateInPlace(
  obj: any,
  translateFn: (s: string) => string,
  seen: WeakSet<object> = new WeakSet(),
  depth: number = 0
): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (depth > MAX_DEEP_DEPTH) return obj;
  if (seen.has(obj)) return obj;
  seen.add(obj);

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i];
      if (typeof item === 'string') {
        if (isTranslatableString(item)) {
          const translated = translateFn(item);
          if (translated) obj[i] = translated;
        }
      } else if (item !== null && typeof item === 'object') {
        deepTranslateInPlace(item, translateFn, seen, depth + 1);
      }
    }
    return obj;
  }

  for (const key of Object.keys(obj)) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const val = obj[key];
    if (typeof val === 'string') {
      if (isTranslatableString(val)) {
        const translated = translateFn(val);
        if (translated) obj[key] = translated;
      }
    } else if (val !== null && typeof val === 'object') {
      deepTranslateInPlace(val, translateFn, seen, depth + 1);
    }
  }
  return obj;
}

// ==================== RPG Maker 文本扫描 ====================

export function scanRPGMakerDialog(callback: (texts: Set<string>) => void): void {
  if (typeof window.DataManager === 'undefined') {
    logger.addLog('DataManager 不可用，跳过文本扫描', LogLevel.WARNING);
    callback(new Set());
    return;
  }

  const texts = new Set<string>();

  const tryScan = () => {
    if (typeof window.$data === 'undefined' || !window.$data) {
      setTimeout(tryScan, 500);
      return;
    }

    for (const key of Object.keys(window.$data)) {
      const data = (window.$data as any)[key];
      if (data) {
        collectTexts(data, texts);
      }
    }

    logger.addLog(`RPG Maker 文本扫描完成: ${texts.size} 条唯一文本`, LogLevel.INFO);
    callback(texts);
  };

  setTimeout(tryScan, 1000);
}

// ==================== 文本收集（递归）====================

export function collectTexts(
  obj: any,
  set: Set<string>,
  seen: WeakSet<object> = new WeakSet(),
  depth: number = 0
): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string') {
    if (obj.trim() && obj.length >= 2 &&
      JP_TEXT_RE.test(obj)) {
      set.add(obj.trim());
    }
    return;
  }
  if (typeof obj !== 'object' || depth > MAX_DEEP_DEPTH) return;
  // 循环引用保护：自引用数据会导致无限递归与栈溢出
  if (seen.has(obj)) return;
  seen.add(obj);

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) collectTexts(obj[i], set, seen, depth + 1);
    return;
  }
  for (const key of Object.keys(obj)) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      collectTexts(obj[key], set, seen, depth + 1);
    }
  }
}
