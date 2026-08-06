// ==================== 文件保存 ====================
export function saveJSONFile(
  jsonData: Record<string, any>,
  fileName: string
) {
  const jsonString = JSON.stringify(jsonData, null, 2);
  downloadBlob(jsonString, `${fileName}.json`, 'application/json');
}

export function saveCSVFile(
  rows: (string | number)[][],
  fileName: string
) {
  const csv = rows
    .map(row =>
      row
        .map(cell => {
          const str = String(cell ?? '');
          return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(',')
    )
    .join('\n');
  downloadBlob(csv, `${fileName}.csv`, 'text/csv;charset=utf-8');
}

export function saveTSVFile(rows: (string | number)[][], fileName: string) {
  const tsv = rows
    .map(row => row.map(cell => String(cell ?? '').replace(/\t/g, ' ')).join('\t'))
    .join('\n');
  downloadBlob(tsv, `${fileName}.tsv`, 'text/tab-separated-values;charset=utf-8');
}

export function downloadBlob(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return ext;
}

export function isSupportedFileType(fileName: string): boolean {
  const supported = ['json', 'csv', 'tsv', 'xlsx', 'xls'];
  return supported.includes(getFileType(fileName));
}

// ==================== 环境检测 ====================

export function checkNodeJS(): boolean {
  return typeof module !== 'undefined' && !!module.exports;
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

export async function requestSource(
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
  const response = await requestSource(
    url,
    'GET',
    { 'Content-Type': 'application/json' }
  );
  const data = await response.json();
  return typeof callback === 'function' ? callback(data) : data;
}

export async function getCsvFileData(url: string): Promise<string[][]> {
  const response = await requestSource(url, 'GET', { 'Content-Type': 'text/csv' });
  const text = await response.text();
  return parseCSV(text);
}

export async function get<T = any>(
  url: string,
  headers?: Record<string, string>
): Promise<T> {
  const response = await requestSource(url, 'GET', headers);
  return (await response.json()) as T;
}

// ==================== 路径处理 ====================

export async function getPath(fileName: string): Promise<string> {
  if (checkNodeJS()) {
    try {
      // @ts-ignore
      const path = await getGameCWD();
      if (path) return `${path}/${fileName}`;
    } catch {
      // ignore
    }
  }
  return fileName;
}

// ==================== 正则解析 ====================
export function parseRegex(str: any): any {
  if (typeof str !== 'string') return str;
  const m = str.match(/^\/(.*)\/([gimsuy]*)$/);
  return m ? new RegExp(m[1], m[2]) : str;
}

// ==================== CSV / TSV 解析 ====================
export function parseCSV(csvContent: string, delimiter: string = ','): string[][] {
  const rows: string[][] = [];
  const lines = csvContent.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const values = line.split(new RegExp(`${delimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)`));
    rows.push(values.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"').trim()));
  }
  return rows;
}

/** 解析 TSV */
export function parseTSV(content: string): string[][] {
  return parseCSV(content, '\t');
}

// ==================== XLSX 解析（纯前端，无依赖） ====================
export async function parseXLSX(file: File): Promise<string[][]> {
  const XLSX = (window as any).XLSX || getNodeJSModule('xlsx');
  if (XLSX) {
    const buf = await readFileAsArrayBuffer(file);
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
  }
  throw new Error('未检测到 SheetJS 库，请引入 xlsx.js 后重试，或改用 CSV/JSON 格式');
}

// ==================== 翻译数据解析 ====================

/**
 * 将任意格式的翻译数据统一为标准规则数组
 * 支持格式：
 *   1. { "原文": "译文" } 的 JSON 对象
 *   2. [["原文","译文"], ...] 的二维数组
 *   3. [["原文","正则","译文"], ...] 的三维数组
 *   4. CollData.json 格式 { key: { name, transengine, data: [...] } }
 */
export async function normalizeTranslationData(
  data: any,
  fileName?: string
): Promise<Array<{
  source: string | RegExp;
  target: string;
  regex?: RegExp
}> | null> {
  if (fileName) {
    data = await getJSONFileData(fileName);
  }

  // 情况1: CollData.json 格式
  if (typeof data === 'object' && !Array.isArray(data)) {
    const keys = Object.keys(data);
    const first = data[keys[0]];
    if (first && typeof first === 'object' && 'data' in first && Array.isArray(first.data)) {
      return parseCollData(data);
    }
    // 普通 KV 对象
    const rules: Array<{
      source: string | RegExp;
      target: string;
      regex?: RegExp
    }> = [];
    for (const [k, v] of Object.entries(data)) {
      if (typeof v !== 'string') continue;
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
    return rules;
  }

  // 情况2/3: 二维/三维数组
  if (Array.isArray(data)) {
    return data
      .filter(row => Array.isArray(row) && row.length >= 2)
      .map(row => {
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

  return [];
}

/** 解析 CollData.json 格式 */
function parseCollData(data: Record<string, any>): Array<{
  source: string | RegExp;
  target: string;
  regex?: RegExp
}> {
  const rules: Array<{
    source: string | RegExp;
    target: string;
    regex?: RegExp
  }> = [];
  for (const key of Object.keys(data)) {
    const item = data[key];
    if (!Array.isArray(item?.data)) continue;
    for (const row of item.data) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const [src, pattern, tgt] = row;
      const regex = parseRegex(pattern || src);
      rules.push({
        source: regex instanceof RegExp ? regex : src,
        target: tgt || pattern || src,
        regex: regex instanceof RegExp ? regex : undefined,
      });
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
export function safeJSONParse<T = any>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

export function timestampFileName(prefix: string, ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${prefix}_${ts}.${ext}`;
}

export function stripControlChars(str: string): string {
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}