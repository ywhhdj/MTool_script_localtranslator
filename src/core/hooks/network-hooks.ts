/**
 * hooks/network-hooks.ts — XHR / Fetch 拦截
 *：
 *   1. XHR：原始引用在模块加载时抓取，不受二次 Hook 影响；
 *   2. XHR：writable/configurable = true，并只改写「确实命中」的请求；
 *   3. XHR：readystatechange 监听器在 send 时 用一次性标记位防重复；
 *   4. Fetch： content-type 命中且提供 transformResponse 时才 clone；
 *   5. Fetch：transformResponse 抛异常时返回未被消费的原始 response；
 *   6. 两套 Hook 都可完整还原（幂等安装）。
 */

import type { Disposable } from "../domain/disposable";
import { hostWindow } from "../platform/env";

export interface XhrHookOptions {
  urlPatterns?: Array<string | RegExp>;
  method?: "GET" | "POST";
  transformRequest?: (body: string, url: string) => string | null;
  transformResponse?: (data: any, url: string) => any;
}

export interface FetchHookOptions {
  shouldIntercept?: (url: string, init?: any) => boolean;
  transformRequest?: (args: any[]) => any[] | null;
  transformResponse?: (data: any, url: string, init?: any) => any;
  jsonOnly?: boolean;
}

type XhrExtras = {
  _mtoolUrl?: string;
  _mtoolMethod?: string;
  _mtoolPatched?: boolean;
  _mtoolHooked?: boolean;
};

const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;
const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;

export class NetworkHooks implements Disposable {
  private xhrInstalled = false;
  private fetchInstalled = false;
  private fetchOriginal: typeof fetch | null = null;
  private xhrOptions: XhrHookOptions | null = null;
  private fetchOptions: FetchHookOptions | null = null;
  private callback: ((body: any, url: string) => void) | null = null;

  get xhrActive(): boolean {
    return this.xhrInstalled;
  }

  get fetchActive(): boolean {
    return this.fetchInstalled;
  }

  // ==================== XHR ====================

  installXhr(
    options: XhrHookOptions,
    callback?: (body: any, url: string) => void
  ): boolean {
    if (this.xhrInstalled) return false;
    const win = hostWindow();
    if (!win || typeof win.XMLHttpRequest === "undefined") return false;

    this.xhrOptions = { method: "POST", ...options };
    this.callback = callback ?? null;
    const opts = this.xhrOptions;
    const cb = this.callback;

    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest & XhrExtras,
      method: string,
      url: string | URL,
      ...rest: any[]
    ) {
      this._mtoolUrl = String(url);
      this._mtoolMethod = String(method).toUpperCase();
      return (originalOpen as any).call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (
      this: XMLHttpRequest & XhrExtras,
      body?: any
    ) {
      const url = this._mtoolUrl || "";
      const method = this._mtoolMethod || "GET";
      const patterns = opts.urlPatterns ?? [];
      const methodMatch = (opts.method ?? "GET") === method;
      const urlMatch =
        patterns.length === 0 ||
        patterns.some((p) => (p instanceof RegExp ? p.test(url) : url.includes(p)));

      if (!urlMatch || !methodMatch) {
        return (originalSend as any).call(this, body);
      }

      let payload = body;
      if (opts.transformRequest && typeof body === "string") {
        const transformed = opts.transformRequest(body, url);
        if (transformed === null) {
          // 完全拦截：伪造一个已完成的响应（不发网络请求）
          const define = (prop: string, value: any) =>
            Object.defineProperty(this, prop, {
              value,
              writable: true,
              configurable: true,
            });
          define("readyState", 4);
          define("status", 200);
          define("responseText", '{"intercepted":true}');
          define("response", { intercepted: true });
          this.dispatchEvent(new Event("readystatechange"));
          this.dispatchEvent(new Event("load"));
          return;
        }
        payload = transformed;
      }

      if (opts.transformResponse && !this._mtoolHooked) {
        this._mtoolHooked = true;
        const self = this;
        this.addEventListener("readystatechange", () => {
          if (self.readyState !== 4) return;
          const status = (self as any).status ?? 0;
          if (status < 200 || status >= 300) return;
          try {
            const responseType = (self as any).responseType;
            if (responseType === "blob" || responseType === "arraybuffer" || responseType === "document") {
              return;
            }
            let data: any;
            if (responseType === "json") {
              data = (self as any).response;
            } else {
              const contentType = self.getResponseHeader("content-type") || "";
              if (!contentType.includes("json") && !contentType.includes("text")) return;
              data = JSON.parse((self as any).responseText || "null");
            }
            const next = opts.transformResponse!(data, url);
            if (next === undefined || next === data) return;
            // writable:true —— 后续代码若再次写入不会抛错
            if (responseType === "json") {
              Object.defineProperty(self, "response", {
                value: next,
                writable: true,
                configurable: true,
              });
            }
            Object.defineProperty(self, "responseText", {
              value: JSON.stringify(next),
              writable: true,
              configurable: true,
            });
            self._mtoolPatched = true;
          } catch {
            /* 单个响应转换失败不影响游戏 */
          }
        });
      }

      if (cb) {
        try {
          cb(payload, url);
        } catch {
          /* ignore */
        }
      }
      return (originalSend as any).call(this, payload);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (
      this: XMLHttpRequest,
      header: string,
      value: string
    ) {
      return (originalSetHeader as any).call(this, header, value);
    };

    this.xhrInstalled = true;
    return true;
  }

  uninstallXhr(): void {
    if (!this.xhrInstalled) return;
    XMLHttpRequest.prototype.open = originalOpen;
    XMLHttpRequest.prototype.send = originalSend;
    XMLHttpRequest.prototype.setRequestHeader = originalSetHeader;
    this.xhrInstalled = false;
    this.xhrOptions = null;
    this.callback = null;
  }

  // ==================== Fetch ====================

  installFetch(options: FetchHookOptions = {}): boolean {
    if (this.fetchInstalled) return false;
    const win = hostWindow();
    if (!win || typeof win.fetch === "undefined") return false;

    this.fetchOptions = { jsonOnly: true, ...options };
    this.fetchOriginal = win.fetch.bind(win);
    const opts = this.fetchOptions;
    const original = this.fetchOriginal;

    const hooked = async function (...args: any[]): Promise<Response> {
      const [input, init] = args;
      const url = typeof input === "string" ? input : (input as any)?.url || String(input);
      if (opts.shouldIntercept && !opts.shouldIntercept(url, init)) {
        return (original as any)(...args);
      }

      let newArgs = args;
      if (opts.transformRequest) {
        const transformed = opts.transformRequest(args);
        if (transformed === null) {
          return new Response(JSON.stringify({ intercepted: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        newArgs = transformed;
      }

      const response = await (original as any)(...newArgs);
      if (!opts.transformResponse) return response;

      if (opts.jsonOnly) {
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("json") && !contentType.includes("text")) return response;
      }

      try {
        // 只在确定要改写时才 clone（避免大响应无谓的内存翻倍）
        const body = await response.clone().json();
        const next = opts.transformResponse(body, url, init);
        if (next === undefined || next === body) return response;
        return new Response(JSON.stringify(next), {
          status: response.status,
          statusText: response.statusText,
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        return response; // 转换失败 → 原样放行
      }
    } as typeof fetch;

    win.fetch = hooked;
    this.fetchInstalled = true;
    return true;
  }

  uninstallFetch(): void {
    if (!this.fetchInstalled) return;
    const win = hostWindow();
    if (win && this.fetchOriginal) win.fetch = this.fetchOriginal;
    this.fetchOriginal = null;
    this.fetchInstalled = false;
    this.fetchOptions = null;
  }

  dispose(): void {
    this.uninstallXhr();
    this.uninstallFetch();
  }
}
