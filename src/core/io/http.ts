/**
 * io/http.ts — 极简 XHR 请求（供「测试翻译」等主动请求场景使用）
 *
 * responseType:'json' 的老式 MTool 接口。
 */

export interface XhrResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export function xhrRequest<T = any>(
  url: string,
  method: "GET" | "POST" = "GET",
  headers: Record<string, string> = {},
  data?: unknown,
  timeoutMs: number = 10000
): Promise<XhrResult<T>> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      for (const key of Object.keys(headers)) xhr.setRequestHeader(key, headers[key]);
      xhr.responseType = "json";
      xhr.timeout = timeoutMs;
      xhr.onload = () => {
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          data: (xhr.response as T) ?? null,
          error: xhr.status >= 200 && xhr.status < 300 ? undefined : xhr.statusText,
        });
      };
      xhr.onerror = () => resolve({ ok: false, status: 0, data: null, error: "网络错误（无法连接服务器）" });
      xhr.ontimeout = () => resolve({ ok: false, status: 408, data: null, error: "请求超时" });
      xhr.send(data === undefined ? null : JSON.stringify(data));
    } catch (e: any) {
      resolve({ ok: false, status: 0, data: null, error: e?.message ?? String(e) });
    }
  });
}
