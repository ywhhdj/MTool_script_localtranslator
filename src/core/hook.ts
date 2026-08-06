import { EngineType } from '../typings/enum';
import config from '../config';
import logger, { LogLevel } from './logger';

export function hookMethod(
  obj: any,
  args: any[],
  oriMethod: (...args: any[]) => any,
  callback?: (...args: any[]) => any
) {
  try {
    if (typeof callback === 'function') {
      const newArgs = callback(args);
      const finalArgs = Array.isArray(newArgs) ? newArgs : args;
      return oriMethod.apply(obj, finalArgs);
    }
    return oriMethod.apply(obj, args);
  } catch (error) {
    console.error(`[Hook] ${oriMethod.name || 'anonymous'} 错误:`, error);
    return oriMethod.apply(obj, args);
  }
}

function isEngineEnabled(engine: EngineType): boolean {
  return config.user.engines.userConfig?.[engine] ?? true;
}

// ==================== Bitmap 引擎 ====================

export function hookBitmapMessage(callback: (...args: any[]) => any) {
  if (!isEngineEnabled(EngineType.Bitmap)) return;
  if (window.Bitmap && window.Bitmap.prototype.drawText) {
    const _Bitmap_drawText = window.Bitmap.prototype.drawText;
    window.Bitmap.prototype.drawText = function (...args: any[]) {
      return hookMethod(this, args, _Bitmap_drawText, callback);
    };
    logger.addLog('Bitmap 文本渲染已挂钩', LogLevel.INFO);
  }
}

// ==================== Canvas 2D 引擎 ====================

export function hookCanvasMessage(callback: (...args: any[]) => any) {
  if (!isEngineEnabled(EngineType.Canvas2D)) return;

  // document.title
  const _titleDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
  if (_titleDesc?.set) {
    const _setTitle = _titleDesc.set;
    Object.defineProperty(document, 'title', {
      set: function (newTitle) {
        return hookMethod(this, [newTitle], _setTitle, callback);
      },
      get: _titleDesc.get,
      configurable: true,
    });
  }

  // CanvasRenderingContext2D
  if (window.CanvasRenderingContext2D) {
    const ctx = CanvasRenderingContext2D.prototype;
    const measureCache = new Map<string, TextMetrics>();

    for (const methodName of ['fillText', 'strokeText'] as const) {
      const original = ctx[methodName];
      ctx[methodName] = function (...args: any[]) {
        return hookMethod(this, args, original, callback);
      };
    }

    const originalMeasure = ctx.measureText;
    ctx.measureText = function (...args) {
      const cacheKey = String(args[0]);
      if (measureCache.has(cacheKey)) return measureCache.get(cacheKey)!;
      const res = hookMethod(this, args, originalMeasure, callback);
      if (measureCache.size < 500) measureCache.set(cacheKey, res);
      return res;
    };

    logger.addLog('Canvas 2D 文本渲染已挂钩', LogLevel.INFO);
  }
}

// ==================== RPG Maker 引擎 ====================

export function hookRPGMakerMessage(callback: (...args: any[]) => any) {
  if (!isEngineEnabled(EngineType.RPGMaker)) return;

  if (window.Game_Message) {
    const gm = window.Game_Message.prototype;
    for (const methodName of ['add', 'setChoices']) {
      const original = gm[methodName];
      gm[methodName] = function (...args: any[]) {
        return hookMethod(this, args, original, callback);
      };
    }
  }

  if (window.Window_Command) {
    const _addCommand = window.Window_Command.prototype.addCommand;
    window.Window_Command.prototype.addCommand = function (...args: any[]) {
      return hookMethod(this, args, _addCommand, callback);
    };
  }

  if (window.Window_Base) {
    const wb = window.Window_Base.prototype;
    for (const methodName of ['drawText', 'drawTextEx']) {
      const original = wb[methodName];
      wb[methodName] = function (...args: any[]) {
        return hookMethod(this, args, original, callback);
      };
    }
  }

  logger.addLog('RPG Maker 文本渲染已挂钩', LogLevel.INFO);
}

// ==================== PixiJS 引擎 ====================

export function hookPixiJSMessage(callback: (...args: any[]) => any) {
  if (!isEngineEnabled(EngineType.PixiJS)) return;
  if (typeof window.PIXI === 'undefined') return;

  // PIXI.Text
  if (window.PIXI.Text) {
    const updateText = window.PIXI.Text.prototype.updateText;
    window.PIXI.Text.prototype.updateText = function (...args: any[]) {
      if (this._text !== this.lastTranslatedText) {
        const resultArgs = callback([this._text]);
        const translated = resultArgs ? resultArgs[0] : this._text;
        if (translated !== this._text) {
          this.text = translated;
          this.lastTranslatedText = translated;
        }
      }
      return updateText.apply(this, args);
    };
  }

  // PIXI.BitmapText
  if (window.PIXI.BitmapText) {
    const descriptor = Object.getOwnPropertyDescriptor(window.PIXI.BitmapText.prototype, 'text');
    if (descriptor?.set) {
      const setText = descriptor.set;
      Object.defineProperty(window.PIXI.BitmapText.prototype, 'text', {
        set: function (...args: any[]) {
          hookMethod(this, args, setText, callback);
        },
        get: descriptor.get,
        configurable: true,
      });
    }
  }

  logger.addLog('PixiJS 文本渲染已挂钩', LogLevel.INFO);
}

// ==================== Cocos2d-js 引擎 ====================

export function hookCocosLabelMessage(callback: (...args: any[]) => any) {
  if (!isEngineEnabled(EngineType.Cocos2d)) return;

  if (typeof window.cc !== 'undefined' && window.cc.Label) {
    const descriptor = Object.getOwnPropertyDescriptor(window.cc.Label.prototype, 'string');
    if (descriptor?.set) {
      const setString = descriptor.set;
      Object.defineProperty(window.cc.Label.prototype, 'string', {
        set: function (...args: any[]) {
          hookMethod(this, args, setString, callback);
        },
        get: descriptor.get,
        configurable: true,
      });
      logger.addLog('Cocos2d-js Label 已挂钩', LogLevel.INFO);
    }
  }
}

// ==================== XHR Hook ====================

export function hookXhrResponse(
  interceptedUrls: (string | RegExp)[],
  interceptMethods: (string | RegExp)[],
  callback: (...args: any[]) => any
) {
  if (!isEngineEnabled(EngineType.XHR)) return;

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...args: any[]) {
    const urlStr = String(url);
    this._shouldIntercept = {
      url: interceptedUrls.some(p =>
        p instanceof RegExp ? p.test(urlStr) : urlStr.includes(p as string)
      ),
      method: interceptMethods.some(p =>
        p instanceof RegExp ? p.test(method) : method.includes(p as string)
      ),
    };
    this._requestMethod = method;
    this._requestUrl = urlStr;
    return originalOpen.apply(this, [method, url, ...args] as any);
  };

  XMLHttpRequest.prototype.send = function (...args: any[]) {
    const xhr: any = this;
    if (xhr._shouldIntercept?.url || xhr._shouldIntercept?.method) {
      const originalOnReady = xhr.onreadystatechange;
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
          try {
            const originalResponse = xhr.responseText;
            const modified = JSON.stringify(callback(originalResponse, xhr._requestUrl, xhr._requestMethod));
            Object.defineProperty(xhr, 'responseText', { get: () => modified, configurable: true });
          } catch (e) {
            console.error('[Hook] XHR callback error:', e);
          }
        }
        if (originalOnReady) originalOnReady.apply(xhr, args as any);
      };
    }
    return originalSend.apply(this, args as any);
  };

  logger.addLog('XHR 网络拦截已挂钩', LogLevel.INFO);
}

// ==================== Fetch Hook ====================

export function hookFetchResponse(callback: (...args: any[]) => any) {
  if (!isEngineEnabled(EngineType.Fetch)) return;

  const _fetch = window.fetch;
  window.fetch = async function (...args: any[]) {
    try {
      const response = await _fetch.apply(this, args as any);
      if (typeof callback === 'function') {
        const result = callback(response, args);
        if (result) return result;
      }
      return response;
    } catch (e) {
      console.error('[Hook] Fetch error:', e);
      return _fetch.apply(this, args as any);
    }
  };

  logger.addLog('Fetch 网络拦截已挂钩', LogLevel.INFO);
}

// ==================== WebSocket Hook ====================

export function hookWebSocket(
  responseCallback: (...args: any[]) => any,
  requestCallback?: (...args: any[]) => any
) {
  if (!isEngineEnabled(EngineType.WebSocket)) return;

  const _WebSocket = window.WebSocket;
  window.WebSocket = class extends _WebSocket {
    constructor(url: string | URL, ...args: any[]) {
      super(url, ...args);
      const originalSend = this.send;
      this.send = function (data?: any) {
        return hookMethod(this, [data], originalSend, requestCallback);
      };
      const originalOnMessage = this.onmessage as any;
      this.onmessage = function (...args: any[]) {
        return hookMethod(this, args, originalOnMessage, responseCallback);
      };
    }
  } as any;

  logger.addLog('WebSocket 网络拦截已挂钩', LogLevel.INFO);
}

// ==================== RPG Maker 剧情文本扫描 ====================

/**
 * 扫描 RPG Maker DataManager 加载的数据，提取所有日文文本
 * 返回提取到的文本集合
 */
export function hookRPGMakerDialog(scanCallback?: (texts: Set<string>) => void): Set<string> {
  const allTextsSet = new Set<string>();

  if (typeof window.DataManager !== 'undefined') {
    const _DataManager_onLoad = window.DataManager.onLoad;
    window.DataManager.onLoad = function (object: any | null) {
      _DataManager_onLoad.call(this, object);
      scanAndExtractText(object, allTextsSet);
      if (allTextsSet.size > 0) {
        console.log(`[MTool] RPG Maker 文本扫描完成，共 ${allTextsSet.size} 条`, allTextsSet);
        // 通知外部（用于触发预翻译）
        scanCallback?.(allTextsSet);
      }
    };
  }

  return allTextsSet;
}

function scanAndExtractText(obj: any, set: Set<string>) {
  if (!obj) return;
  if (typeof obj === 'string') {
    if (obj.trim() && isJapanese(obj)) {
      set.add(obj.trim());
    }
  } else if (Array.isArray(obj)) {
    obj.forEach(item => scanAndExtractText(item, set));
  } else if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (obj.hasOwnProperty(key)) {
        scanAndExtractText(obj[key], set);
      }
    }
  }
}

function isJapanese(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

// ==================== 预翻译 Hook（核心优化）====================

/**
 * 在 DataManager.onLoad 阶段直接修改数据对象中的文本
 * 
 * 核心优势：
 * 1. 游戏引擎读取到的已经是翻译后的文本
 * 2. 运行时 Hook 直接命中缓存（O(1)），零正则开销
 * 3. 动态文本仍走运行时 Hook，不受影响
 * 
 * @param translator 翻译器实例（需有 translateSync 方法）
 * @param translateFn 自定义翻译函数（可选）
 */
export function hookRPGMakerPreTranslate(
  translator: { translateSync: (text: string) => string },
  translateFn?: (text: string) => string
): void {
  if (typeof window.DataManager === 'undefined') return;

  const fn = translateFn || ((text: string) => translator.translateSync(text));

  const _DataManager_onLoad = window.DataManager.onLoad;
  window.DataManager.onLoad = function (object: any | null) {
    // 先执行原始 onLoad
    _DataManager_onLoad.call(this, object);

    // 再对加载的数据进行深度翻译
    if (object) {
      deepTranslateInPlace(object, fn);
    }
  };

  logger.addLog('RPG Maker 预翻译 Hook 已安装（数据加载时直接替换）', LogLevel.SUCCESS);
}

/**
 * 深度遍历对象，原地替换所有可翻译的字符串
 * 
 * 优化策略：
 * - 对字符串直接调用翻译函数
 * - 递归处理数组和对象
 * - 跳过明显的非文本字段（如 ID、坐标等纯数字）
 * - 跳过控制字符开头的文本（RPG Maker 控制码）
 */
function deepTranslateInPlace(obj: any, translateFn: (s: string) => string): any {
  if (obj === null || obj === undefined) return;

  if (typeof obj === 'string') {
    // 跳过太短、纯数字、控制码开头的文本
    if (obj.length < 2) return;
    if (/^[\d０-９\s\-+\.\/]+$/.test(obj)) return;
    if (obj.startsWith('\x1b') || obj.startsWith('\u001b')) return; // RPG Maker 控制码

    const result = translateFn(obj);
    // 注意：由于是值类型，无法原地修改，需要在调用处处理
    return result;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i];
      if (typeof item === 'string') {
        if (item.length >= 2 && !/^[\d０-９\s\-+\.\/]+$/.test(item) && !item.startsWith('\x1b')) {
          const translated = translateFn(item);
          if (translated !== item) {
            obj[i] = translated;
          }
        }
      } else if (typeof item === 'object' && item !== null) {
        deepTranslateObject(item, translateFn);
      }
    }
    return;
  }

  if (typeof obj === 'object') {
    deepTranslateObject(obj, translateFn);
  }
}

/**
 * 深度翻译对象的所有属性（原地修改）
 */
function deepTranslateObject(obj: any, translateFn: (s: string) => string): void {
  // 跳过不需要翻译的对象类型
  if (obj.constructor && obj.constructor !== Object &&
    !Array.isArray(obj) &&
    obj.constructor.name !== 'Object') {
    // 可能是特定游戏引擎对象，检查是否有 name/title 等常见文本字段
    const textFields = ['name', 'title', 'description', 'message', 'text', 'note'];
    for (const field of textFields) {
      if (typeof obj[field] === 'string' && obj[field].length >= 2) {
        const translated = translateFn(obj[field]);
        if (translated !== obj[field]) {
          obj[field] = translated;
        }
      }
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    if (!obj.hasOwnProperty(key)) continue;

    const value = obj[key];

    if (typeof value === 'string') {
      // 跳过纯数字/坐标/ID 字段
      if (value.length < 2) continue;
      if (/^[\d０-９\s\-+\.\/]+$/.test(value)) continue;
      if (value.startsWith('\x1b') || value.startsWith('\u001b')) continue;

      const translated = translateFn(value);
      if (translated !== value) {
        obj[key] = translated;
      }
    } else if (typeof value === 'object' && value !== null) {
      deepTranslateInPlace(value, translateFn);
    }
  }
}

// ==================== 统一安装入口 ====================

export function installHooks(callback: (...args: any[]) => any) {
  const cfg = config.user.engines.userConfig;

  if (cfg[EngineType.Bitmap]) hookBitmapMessage(callback);
  if (cfg[EngineType.Canvas2D]) hookCanvasMessage(callback);
  if (cfg[EngineType.RPGMaker]) hookRPGMakerMessage(callback);
  if (cfg[EngineType.PixiJS]) hookPixiJSMessage(callback);
  if (cfg[EngineType.Cocos2d]) hookCocosLabelMessage(callback);
  if (cfg[EngineType.XHR]) hookXhrResponse([], [], callback);
  if (cfg[EngineType.Fetch]) hookFetchResponse(callback);
  if (cfg[EngineType.WebSocket]) hookWebSocket(callback);

  console.log('[MTool] 所有引擎 Hook 安装完成');
}
