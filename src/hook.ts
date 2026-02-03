declare global {
  interface Window {
    PIXI: any;
    Game_Message: any;
    Window_Command: any;
    Window_Base: any;
    cc: any;
    Bitmap: any;
  }

  interface XMLHttpRequest {
    _shouldIntercept?: {
      url: boolean;
      method: boolean;
    };
    _requestMethod?: string;
    _requestUrl?: string | URL;
  }
}

class LocalTranslatorHook {
  static hookMethod(objcet: any, args: any[], oriMethod: ((...args: any[]) => any), callback: ((...args: any[]) => any) | undefined = undefined) {
    try {
      if (typeof callback === 'function') {
        const newArgs = callback(args);
        return oriMethod.apply(objcet, newArgs);
      } else {
        return oriMethod.apply(objcet, args);
      }
    } catch (error) {
      console.error(`[Translator] ${oriMethod.name}发生错误 :`, error);
      return oriMethod.apply(objcet, args);
    }
  }

  static hookBitmapMessage(callback: (...args: any[]) => any) {
    if (window.Bitmap && window.Bitmap.prototype.drawText) {
      const _Bitmap_drawText = window.Bitmap.prototype.drawText;
      window.Bitmap.prototype.drawText = function (...args: any[]) {
        return LocalTranslatorHook.hookMethod(this, args, _Bitmap_drawText, callback);
      };
    }
    console.log("[Translator] 已挂钩 Bitmap 文本渲染");
  }

  static hookCanvasMessage(callback: (...args: any[]) => any) {
    const _titleDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
    if (_titleDesc && _titleDesc.set) {
      const _setTitle = _titleDesc.set;
      Object.defineProperty(document, 'title', {
        set: function (newTitle) {
          return LocalTranslatorHook.hookMethod(this, [newTitle], _setTitle, callback);
        },
        get: _titleDesc.get
      });
    }
    if (window.CanvasRenderingContext2D) {
      const ctx = CanvasRenderingContext2D.prototype;
      ['fillText', 'strokeText'].forEach(methodName => {
        let original = ctx[methodName];
        ctx[methodName] = function (...args: any[]) {
          return LocalTranslatorHook.hookMethod(this, args, original , callback);
        };
      });
      const mCache = new Map();
      const originalMeasureText = ctx.measureText;
      ctx.measureText = function (...args) {
        if (mCache.has(args[0])) return mCache.get(args[0]);
        const res = LocalTranslatorHook.hookMethod(this, args, originalMeasureText, callback);
        if (mCache.size < 500) mCache.set(args[0], res);
        return res;
      };
      console.log("[Translator] 已挂钩 Canvas 文本渲染");
    }
  }

  static hookRPGMakerMessage(callback: (...args: any[]) => any) {
    if (window.Game_Message) {
      const gm = window.Game_Message.prototype;
      ['add', 'setChoices'].forEach(methodName => {
        const original = gm[methodName];
        gm[methodName] = function (...args: any[]) {
          return LocalTranslatorHook.hookMethod(this, args, original, callback);
        };
      });
    }
    if (window.Window_Command) {
      const _addCommand = window.Window_Command.prototype.addCommand;
      window.Window_Command.prototype.addCommand = function (...args: any[]) {
        return LocalTranslatorHook.hookMethod(this, args, _addCommand, callback);
      };
    }

    if (window.Window_Base) {
      const wb = window.Window_Base.prototype;
      ['drawText', 'drawTextEx'].forEach(methodName => {
        const original = wb[methodName];
        wb[methodName] = function (...args: any[]) {
          return LocalTranslatorHook.hookMethod(this, args, original, callback);
        };
      });
    }
    console.log("[Translator] 已挂钩 RPG Maker 文本渲染");
  }

  static hookPixiJSMessage(callback: (...args: any[]) => any) {
    if (typeof window.PIXI !== 'undefined') {
      // 1. 拦截标准文本
      if (window.PIXI.Text) {
        const updateText = window.PIXI.Text.prototype.updateText;
        window.PIXI.Text.prototype.updateText = function (...args: any[]) {
          if (this._text !== this.lastTranslatedText) {
            const translated = callback(this._text);
            if (translated !== this._text) {
              this.text = translated;
              this.lastTranslatedText = translated;
            }
          }
          return updateText.apply(this, args);
        };
      }
      // 2. 拦截位图文本
      if (window.PIXI.BitmapText) {
        const descriptor = Object.getOwnPropertyDescriptor(window.PIXI.BitmapText.prototype, 'text');
        if (descriptor && Object.getOwnPropertyDescriptor(descriptor, 'set')) {
          const setText = descriptor.set;
          Object.defineProperty(window.PIXI.BitmapText.prototype, 'text', {
            set: function (...args) {
              LocalTranslatorHook.hookMethod(this, args, setText as (...args: any[]) => void, callback);
            },
            get: descriptor.get,
            configurable: true
          });
        }
      }
      console.log("[Translator] 已挂钩 PIXI.Text 和 PIXI.BitmapText 系统");
    }
  }

  static hookCocosLabelMessage(callback: (...args: any[]) => any) {
    if (typeof window.cc !== 'undefined' && window.cc.Label) {
      // 拦截 string 属性的设置
      const self = this;
      const descriptor = Object.getOwnPropertyDescriptor(window.cc.Label.prototype, 'string');
      if (descriptor && Object.getOwnPropertyDescriptor(descriptor, 'set')) {
        const setString = descriptor.value.set;
        Object.defineProperty(window.cc.Label.prototype, 'string', {
          set: function (...args) {
            LocalTranslatorHook.hookMethod(this, args, setString, callback);
          },
          get: descriptor.get,
          configurable: true
        });
        console.log("[Translator] 已挂钩 Cocos2d-js Label 系统");
      }
    }
  }

  static hookXhrResponse(interceptedUrls: (string | RegExp)[], interceptMethods: (string | RegExp)[], callback: (...args: any[]) => any) {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...args: any[]) {
      this._shouldIntercept = {
        url: interceptedUrls ? interceptedUrls.some(p => (p instanceof RegExp) ? p.test(url as string) : (url as string).includes(p as string)) : false,
        method: interceptMethods ? interceptMethods.some(p => (p instanceof RegExp) ? p.test(method) : method.includes(p as string)) : false
      };
      this._requestMethod = method;
      this._requestUrl = url;
      return originalOpen.apply(this, [method, url, ...args]);
    };
    XMLHttpRequest.prototype.send = function (...args: any[]) {
      const xhr = this;
      if (xhr._shouldIntercept?.url || xhr._shouldIntercept?.method) {
        const originalOnReadyStateChange = xhr.onreadystatechange;
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4 && xhr.status === 200) {
            const originalResponse = xhr.responseText;
            const modifiedResponse = JSON.stringify(callback(originalResponse, xhr._requestUrl, xhr._requestMethod));
            // 使用 defineProperty 修改 responseText
            Object.defineProperty(xhr, 'responseText', {
              get: function () {
                return modifiedResponse;
              },
              configurable: true
            });
          }
          if (originalOnReadyStateChange) {
            originalOnReadyStateChange.apply(xhr, args);
          }
        };
      }
      return originalSend.apply(this, args);
    };
    console.log("[Translator] 已挂钩 XHR 消息系统");
  }

  static hookFectResponse(callback: (...args: any[]) => any): void {
    const _fetch = window.fetch;
    window.fetch = async function (...args) {
      const Oriesponse = await _fetch.apply(this, args);
      if (typeof callback === 'function') {
        try {
          const result = callback(Oriesponse, args);
          if (result) {
            return result;
          }
        } catch (e) {
          console.error('[Translator] Fetch callback error:', e);
          return Oriesponse;
        }
      }
      return Oriesponse;
    };
    console.log("[Translator] 已挂钩 Fect 消息系统");
  }

  static hookWebSocket(responseCallback: (...args: any[]) => any, requestCallback: ((...args: any[]) => any) | undefined = undefined) {
    const _WebSocket = window.WebSocket;
    window.WebSocket = class extends _WebSocket {
      constructor(url: string | URL, ...args: any[]) {
        super(url, ...args);
        const originalSend = this.send;
        this.send = function (data?: any) {
          return LocalTranslatorHook.hookMethod(this, [data], originalSend, requestCallback);
        };
        const originalOnMessage = this.onmessage as (this: WebSocket, ev: MessageEvent<any>) => any;
        this.onmessage = function (...args) {
          return LocalTranslatorHook.hookMethod(this, args, originalOnMessage, responseCallback);
        };
      }
    };
    console.log("[Translator] 已挂钩 WebSocket 消息系统");
  }
}
export default LocalTranslatorHook;