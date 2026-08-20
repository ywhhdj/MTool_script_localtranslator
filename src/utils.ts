export async function saveJSONFile(jsonData: Record<string, any>, fileName: string) {
  await download(jsonData, `${fileName}.json`, 'json');
}

// ==================== 文件读取 ====================

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve((e.target?.result as string) || '');
    reader.onerror = () => reject(new Error(`读取文件失败: ${file.name}`));
    reader.readAsText(file, 'UTF-8');
  });
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as ArrayBuffer);
    reader.onerror = () => reject(new Error(`读取文件失败: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

// ==================== 文件类型判断 ====================

export function getFileType(fileName: string): string {
  const parts = fileName.split('.');
  if (parts.length < 2) return '';
  return parts.pop()!.toLowerCase();
}

// ==================== 环境检测 ====================

export function checkNodeJS(): boolean {
  return typeof (module as any) !== 'undefined' && !!(module as any).exports;
}

export function getNodeJSModule(moduleName: string): any {
  if (checkNodeJS()) {
    try {
      return require(moduleName);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// ==================== 网络请求 ====================

const oriFetch = window.fetch;

export async function request(
  url: string,
  method: string = 'GET',
  headers?: Record<string, string>
): Promise<Response> {
  const response = await oriFetch(url, { method, headers });
  if (response.ok) return response;
  throw new Error(`请求失败 [${response.status}]: ${url}`);
}

export async function getJSONFileData(
  url: string,
  callback?: (data: Record<string, any>) => any
): Promise<any> {
  const response = await request(url, 'GET', { 'Content-Type': 'application/json' });
  const data = await response.json();
  return typeof callback === 'function' ? callback(data) : data;
}

export async function getCsvFileData(url: string): Promise<string[][]> {
  const response = await request(url, 'GET', { 'Content-Type': 'text/csv' });
  const text = await response.text();
  return parseDelimited(text, ',');
}

// ==================== 路径处理 ====================

export async function getPath(fileName: string): Promise<string> {
  if (checkNodeJS()) {
    try {
      const path = await getGameCWD();
      if (path) return `${path}/${fileName}`;
    } catch { }
  }
  return fileName;
}

// ==================== 正则解析（统一工具）====================
export function parseRegex(str: any): any {
  if (typeof str !== 'string') return str;
  const m = str.match(/^\/(.+?)\/([gimsuy]*)$/);
  if (m) {
    try {
      const flags = m[2] || 'g';
      const finalFlags = flags.includes('g') ? flags : flags + 'g';
      return new RegExp(m[1], finalFlags);
    } catch {
      return str;
    }
  }
  return str;
}

export function isRegexPattern(val: any): boolean {
  if (val instanceof RegExp) return true;
  if (typeof val !== 'string') return false;
  return /^\/.+\/[gimsuy]*$/.test(val);
}

// ==================== CSV / TSV 解析 ====================

export function parseDelimited(csvContent: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  const lines = csvContent.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const values = line.split(new RegExp(`${delimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)`));
    rows.push(values.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"').trim()));
  }
  return rows;
}

export function parseTSV(content: string): string[][] {
  return parseDelimited(content, '\t');
}

// ==================== XLSX 解析 ====================

export async function parseXLSX(file: File): Promise<string[][]> {
  const XLSX = window.XLSX || getNodeJSModule('xlsx');
  if (XLSX) {
    const buf = await readFileAsArrayBuffer(file);
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
  }
  throw new Error('未检测到 SheetJS 库，请引入 xlsx.js 后重试，或改用 CSV/JSON 格式');
}

// ==================== 翻译数据解析（统一入口）====================

type TranslateDataNormalized = Array<{
  source: string | RegExp;
  target: string;
  regex?: RegExp;
}>;

/**
 * 将任意格式的翻译数据统一为标准规则数组
 * 支持格式：
 *   1. { "原文": "译文" } 的 JSON 对象
 *   2. [["原文","译文"], ...] 的二维数组
 *   3. [["原文","正则","译文"], ...] 的三维数组
 *   4. CollData.json格式: { "25045": { id, name, data: [[...], ...] } }
 */
export function normalizeTranslationData(
  data: any,
  isDefault: boolean = false
): TranslateDataNormalized {
  if (!data) throw new Error('未提供有效的翻译数据');

  if (isDefault) {
    const rules: TranslateDataNormalized = [];
    for (const [k, v] of Object.entries(data)) {
      if (typeof v !== 'string') continue;
      if (k.startsWith('/') && k.endsWith('/')) {
        const inner = k.slice(1, -1); // 去掉首尾斜杠
        try {
          const parsed = new RegExp(inner, 'g');
          rules.push({
            source: parsed,
            target: v,
            regex: parsed,
          });
        } catch {
          // 正则解析失败，降级为精确匹配
          rules.push({
            source: k,
            target: v,
          });
        }
      } else {
        rules.push({
          source: k,
          target: v,
        });
      }

    }
    return rules;
  }

  // 情况1: CollData.json 格式
  if (isCollDataFormat(data)) {
    const keys = Object.keys(data);
    let first = data[keys[0]];
    for (const key of keys) {
      const item = data[key];
      if (item.type === "trs" && item.data && item.data.length > 0) {
        first = item;
        break;
      }
    }
    if (first && typeof first === 'object' && 'data' in first && Array.isArray(first.data)) {
      return parseCollData(data);
    }
    return [];
  }

  // 情况2/3: 二维/三维数组
  if (Array.isArray(data)) {
    return data
      .filter((row: any) => Array.isArray(row) && row.length >= 2)
      .map((row: any[]) => {
        const [src, pattern, tgt] = row;
        if (row.length >= 3 && pattern) {
          const regex = parseRegex(pattern);
          return {
            source: regex instanceof RegExp ? regex : src,
            target: tgt || pattern,
            regex: regex instanceof RegExp ? regex : undefined,
          };
        }
        const regex = parseRegex(src);
        return {
          source: regex instanceof RegExp ? regex : src,
          target: pattern,
          regex: regex instanceof RegExp ? regex : undefined,
        };
      });
  }

  // 对象格式 { "原文": "译文" }
  if (typeof data === 'object' && data !== null) {
    const rules: Data.TranslationRule[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string' && k && v) {
        const parsed = parseRegex(k);
        if (parsed instanceof RegExp) {
          rules.push({
            source: parsed,
            target: v,
            regex: parsed
          });
        } else {
          rules.push({
            source: k,
            target: v
          });
        }
      }
    }
  }
  throw new Error(`无法识别的文件格式`);
}

function isCollDataFormat(data: any): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  // CollData.json: { "25045": { id, name, data: [[...], ...] } }
  const firstKey = Object.keys(data)[0];
  if (!firstKey) return false;
  const firstVal = data[firstKey];
  return firstVal && Array.isArray(firstVal.data) && firstVal.data.length > 0;
}

type CollData = Record<string, {
  id: number,
  data: string | string[][],
  name: string,
  type: "script" | "trs",
  desc: string,
  lang: number,
  slang: number,
  transengine: "Bing",
  gameengine: string,
  public: number,
  createdate: number,
  updatedate: number,
  ownername: string,
  ownerid: number,
  downloadcnt: number,
  permission: {
    [key: string]: {
      permission: string[]
    }
  },
  status: string | null,
  [key: string]: any
}>

function parseCollData(data: CollData): TranslateDataNormalized {
  const rules: Data.TranslationRule[] = [];
  for (const key of Object.keys(data)) {
    const item = data[key];
    if (item.type !== "trs") continue;
    if (!item?.data || !Array.isArray(item.data)) continue;
    for (const row of item.data) {
      if (!Array.isArray(row)) continue;
      // CollData 格式: [source, pattern/regex, target]
      if (row.length >= 3 && row[0] && row[2]) {
        const src = String(row[0]).trim();
        const tgt = String(row[2]).trim();
        if (src && tgt && !src.startsWith('【') && !src.startsWith('[')) {
          // 检测是否为正则
          if (typeof row[1] === 'string' && row[1].startsWith('/') && row[1].endsWith('/')) {
            try {
              const inner = row[1].slice(1, -1);
              rules.push({
                source: new RegExp(inner, 'g'),
                target: tgt
              });
            } catch {
              rules.push({
                source: src,
                target: tgt
              });
            }
          } else {
            rules.push({
              source: src,
              target: tgt
            });
          }
        }
      }
    }
  }
  return rules;
}

// ==================== 防抖 / 节流 ====================

export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  }) as T;
}

export function throttle<T extends (...args: any[]) => void>(fn: T, interval: number): T {
  let last = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - last >= interval) {
      last = now;
      fn(...args);
    }
  }) as T;
}

// ==================== 字符串工具 ====================

export function safeJSONParse<T = any>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

export function timestampFileName(prefix: string, ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${prefix}_${ts}.${ext}`;
}

/**
 * Bug 1 修复：stripControlChars 增加类型检查
 */
export function stripControlChars(str: any): string {
  if (str === null || str === undefined) return '';
  if (typeof str !== 'string') {
    try { str = String(str); } catch { return ''; }
  }
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export function isResourcePath(text: any): boolean {
  if (typeof text !== 'string') return false;
  if (text.length === 0) return false;
  const resourceExts = /\.(png|jpe?g|gif|webp|svg|bmp|ico|mp3|wav|ogg|mp4|webm|avi|mov|woff2?|ttf|otf|eot)$/i;
  if (resourceExts.test(text)) return true;
  if (/^(img|image|images|audio|video|fonts?|res|resource|assets?|textures?)\//i.test(text)) return true;
  if (/^data:(image|audio|video)\//.test(text)) return true;
  if (/^ftp:\/\//.test(text)) return true;
  return false;
}

export function isValidText(text: any): text is string {
  if (typeof text !== 'string') return false;
  if (text.length === 0) return false;
  if (text.length > 500) return false;
  if (isResourcePath(text)) return false;
  if (/^\s*$/.test(text)) return false;
  return true;
}

export function download(
  data: any,
  fileName: string,
  type: "csv" | "json" | "tsv" | "txt" = "json"
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      let mimeType = ""
      let data_ = null
      switch (type) {
        case "txt":
          mimeType = "text/plain"
          break;
        case "csv":
          mimeType = "text/csv"
          data_ = data
            .map((row: (string | number)[]) =>
              row
                .map(cell => {
                  const str = String(cell ?? '');
                  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
                })
                .join(',')
            )
            .join('\n');
          break;
        case "tsv":
          mimeType = "text/tab-separated-values"
          data_ = data
            .map((row: (string | number)[]) => row.map(cell => String(cell ?? '').replace(/\t/g, ' ')).join('\t'))
            .join('\n');
          break;
        default:
          mimeType = "application/json"
          data_ = JSON.stringify(data, null, 2)
          break;
      }
      const blob = new Blob([data_], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve(true);
    } catch (error) {
      reject(error);
    }
  });
}


export function xhrRequest(
  url: string,
  method: "GET" | "POST" = "GET",
  headers: Record<string, string> = {},
  data?: any
) {
  return new Promise((
    resolve: (data: any) => void,
    reject: (err: {
      status?: number;
      statusText?: string;
      error: string;
    }) => void
  ) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const key in headers) {
      xhr.setRequestHeader(key, headers[key]);
    }
    xhr.responseType = 'json';
    xhr.timeout = 10000;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        reject({
          status: xhr.status,
          statusText: xhr.statusText,
          error: xhr.response || xhr.statusText
        });
      }
    };
    xhr.onerror = () => {
      reject({ status: xhr.status, error: '网络错误（无法连接服务器）' });
    };

    xhr.ontimeout = () => {
      reject({
        status: 408,
        error: '请求超时'
      });
    };
    try {
      xhr.send(JSON.stringify(data));
    } catch (e: any) {
      reject({
        error: '序列化载荷失败：' + e.message
      });
    }
  });
}