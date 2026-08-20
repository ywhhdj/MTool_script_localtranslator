import config from '../../config';
import { isResourcePath, safeJSONParse } from '../../utils';
import logger, { LogLevel } from '../logger';

type HookCallback = (...args: any[]) => any;

// ==================== Fetch Hook ====================

let fetchHooked = false;
let fetchOriginal: typeof fetch | null = null;

export function hookFetch(options: Options.FetchHookOptions = {}): void {
  if (fetchHooked) {
    logger.addLog('[Fetch] 已安装，跳过重复安装', LogLevel.DEBUG);
    return;
  }
  if (typeof window.fetch === 'undefined') {
    logger.addLog('[Fetch] window.fetch 不可用', LogLevel.ERROR);
    return;
  }

  const {
    shouldIntercept,
    transformRequest,
    transformResponse,
    jsonOnly = true,
  } = options;

  fetchOriginal = window.fetch.bind(window);
  fetchHooked = true;

  console.log('[MToolTranslatorPlugin][Fetch] ✅ Fetch Hook 已安装', { jsonOnly });

  window.fetch = async function (...args: any[]): Promise<Response> {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const method = (init?.method || 'GET').toUpperCase();

    // 1. 资源路径直接放行
    if (isResourcePath(url)) {
      console.log(`[MToolTranslatorPlugin][Fetch] ⏭️ 资源放行: ${method} ${url}`);
      //@ts-ignore
      return fetchOriginal!(...args);
    }

    // 2. 用户自定义过滤
    if (shouldIntercept && !shouldIntercept(url, init)) {
      console.log(`[MToolTranslatorPlugin][Fetch] ⏭️ 自定义过滤放行: ${method} ${url}`);
      //@ts-ignore
      return fetchOriginal!(...args);
    }

    // 3. 请求体变换
    let newArgs = args;
    if (transformRequest) {
      const transformed = transformRequest(args);
      if (transformed === null) {
        // null 表示完全拦截，不发送网络请求
        console.log(`[MToolTranslatorPlugin][Fetch] 🚫 请求被拦截: ${method} ${url}`);
        return new Response(JSON.stringify({ intercepted: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      newArgs = transformed;
    }

    console.log(`[MToolTranslatorPlugin][Fetch] ➡️ ${method} ${url}`);

    // 4. 发送请求
    //@ts-ignore
    const response = await fetchOriginal!(...newArgs);

    // 5. 仅处理 JSON 响应（保护二进制资源）
    if (jsonOnly) {
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json') && !contentType.includes('text')) {
        console.log(`[MToolTranslatorPlugin][Fetch] ⏭️ 非JSON响应放行: ${contentType}`);
        return response;
      }
    }

    // 6. 响应变换
    if (transformResponse) {
      try {
        const body = await response.clone().json();
        const newBody = transformResponse(body, url, init);
        if (config.debug) {
          console.log(`[MToolTranslatorPlugin][Fetch] ✏️ 响应已变换: ${url}`);
        }
        return new Response(JSON.stringify(newBody), {
          status: response.status,
          statusText: response.statusText,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e: any) {
        logger.addLog(`[Fetch] 响应变换失败: ${e.message}`, LogLevel.ERROR);
        return response;
      }
    }

    return response;
  } as typeof fetch;
}

export function unhookFetch(): void {
  if (!fetchHooked || !fetchOriginal) return;
  window.fetch = fetchOriginal;
  fetchOriginal = null;
  fetchHooked = false;
  console.log('[MToolTranslatorPlugin][Fetch] ↩️ Fetch Hook 已还原');
}

// ==================== XHR Hook ====================

let xhrHooked = false;
const xhrOriginalOpen = XMLHttpRequest.prototype.open;
const xhrOriginalSend = XMLHttpRequest.prototype.send;

export function hookXHR(
  options: Options.XHRHookOptions = {},
  callback: HookCallback = () => { }
): void {
  if (xhrHooked) {
    logger.addLog('[XHR] 已安装，跳过重复安装', LogLevel.DEBUG);
    return;
  }
  if (typeof window.XMLHttpRequest === 'undefined') {
    logger.addLog('[XHR] XMLHttpRequest 不可用', LogLevel.ERROR);
    return;
  }

  const {
    urlPatterns = [],
    method = 'GET',
    transformRequest,
    transformResponse
  } = options;

  xhrHooked = true;
  if (config.debug) {
    console.log('[MToolTranslatorPlugin][XHR] ✅ XHR Hook 已安装', { urlPatterns });
  }

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest & { _url?: string; _method?: string },
    method: string,
    url: string,
    ...rest: any[]
  ) {
    this._url = url;
    this._method = method.toUpperCase();
    if (config.debug) {
      console.log(`[MToolTranslatorPlugin][XHR] ➡️ ${method} ${url}`);
    }
    //@ts-ignore
    return xhrOriginalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest & {
      _url?: string;
      _method?: string
    },
    body?: any
  ) {
    const url = this._url || '';
    const method_ = this._method || 'SEND';

    // 资源路径放行
    if (isResourcePath(url)) {
      if (config.debug) {
        console.log(`[MToolTranslatorPlugin][XHR] ⏭️ 资源放行: ${url}`);
      }
      return xhrOriginalSend.call(this, body);
    }

    // URL 模式匹配
    const matched = urlPatterns.length === 0 || urlPatterns.some(p => {
      if (p instanceof RegExp) return p.test(url);
      return url.includes(p);
    });

    if (!matched || method_ !== method) {
      return xhrOriginalSend.call(this, body);
    }

    // 请求体变换
    let newBody = body;
    if (transformRequest && typeof body === 'string') {
      const result = transformRequest(body, url);
      if (result === null) {
        if (config.debug) {
          console.log(`[MToolTranslatorPlugin][XHR] 🚫 请求被拦截: ${url}`);
        }
        // 模拟响应
        Object.defineProperty(this, 'readyState', { value: 4, writable: true });
        Object.defineProperty(this, 'status', { value: 200, writable: true });
        Object.defineProperty(this, 'responseText', { value: '{"intercepted":true}', writable: true });
        this.dispatchEvent(new Event('load'));
        return;
      }
      newBody = result;
    }

    // 响应拦截
    if (transformResponse) {
      this.addEventListener('readystatechange', () => {
        if (this.readyState === 4 && this.status === 200) {
          try{
            const contentType = this.getResponseHeader('content-type') || '';
            let originalResponse: any;
            const rt = (this as any).responseType;
            if (rt === 'json') {
              originalResponse = this.response;
            } else if (rt === 'blob' || rt === 'arraybuffer' || rt === 'document') {
              return;
            } else {
              // responseType 为 '' 或 'text'，用 responseText
              if (!contentType.includes('json') && !contentType.includes('text')) {
                return;
              }
              originalResponse = safeJSONParse(this.responseText);
            }
            const newResponse = transformResponse(originalResponse, url);
            if (config.debug) {
              console.log(`[MToolTranslatorPlugin][XHR] ✏️ 响应已变换: ${url}`);
            }
            if (rt === 'json') {
              Object.defineProperty(this, 'response', {
                value: newResponse,
                writable: false,
                configurable: true,
              });
            } else {
              Object.defineProperty(this, 'responseText', {
                value: JSON.stringify(newResponse),
                writable: false,
                configurable: true,
              });
            }
          } catch (e: any) {
            logger.addLog(`[XHR] 响应变换失败: ${e.message}`, LogLevel.ERROR);
          }
        }
      });
    }

    // 通知回调
    try { callback(body, url); } catch (e) { /* ignore */ }

    return xhrOriginalSend.call(this, newBody);
  };

  // 拦截 setRequestHeader
  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (header: string, value: string) {
    return originalSetHeader.call(this, header, value);
  };
}

export function unhookXHR(): void {
  if (!xhrHooked) return;
  XMLHttpRequest.prototype.open = xhrOriginalOpen;
  XMLHttpRequest.prototype.send = xhrOriginalSend;
  xhrHooked = false;
  console.log('[MToolTranslatorPlugin][XHR] ↩️ XHR Hook 已还原');
}