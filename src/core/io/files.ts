/**
 * io/files.ts — 文件读取与下载
 *
 * 只依赖浏览器 File API / XLSX
 */

import { requireOptional, resolveGlobal, rawHttp } from "../platform/env";
import { stringifyDelimited } from "./delimited";

export type SupportedExt = "json" | "csv" | "tsv" | "xlsx" | "xls";

export function getFileType(fileName: string): string {
  if (!fileName) return "";
  const idx = fileName.lastIndexOf(".");
  if (idx < 0 || idx === fileName.length - 1) return "";
  return fileName.slice(idx + 1).toLowerCase();
}

export function isSupportedFile(fileName: string): boolean {
  const ext = getFileType(fileName);
  return ["json", "csv", "tsv", "xlsx", "xls"].includes(ext);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || "");
    reader.onerror = () => reject(new Error(`读取文件失败: ${file.name}`));
    reader.readAsText(file, "UTF-8");
  });
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error(`读取文件失败: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

/** XLSX：优先页面上的 SheetJS，其次 Node 环境 require */
export async function parseXlsx(file: File): Promise<string[][]> {
  const XLSX = resolveGlobal("XLSX") || requireOptional("xlsx");
  if (!XLSX) {
    throw new Error("未检测到 SheetJS 库，请引入 xlsx.js 后重试，或改用 CSV/JSON 格式");
  }
  const buf = await readFileAsArrayBuffer(file);
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return (XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][]) || [];
}

/** 按游戏工作目录解析文件路径（MTool 环境下 getGameCWD 可用） */
export async function resolveFilePath(fileName: string): Promise<string> {
  try {
    const fn = (globalThis as any).getGameCWD;
    if (typeof fn === "function") {
      const cwd = await fn();
      if (cwd) return `${cwd}/${fileName}`;
    }
  } catch {
    /* 宿主未提供目录能力 */
  }
  return fileName;
}

/** 读取文本（走平台层注入的原始 fetch，避免被自身 Hook 二次处理） */
export async function fetchText(url: string): Promise<string> {
  const response = await rawHttp.fetch(url, { method: "GET" });
  if (!response.ok) throw new Error(`请求失败 [${response.status}]: ${url}`);
  return response.text();
}

/** 生成带时间戳的导出文件名（页面 title 含非法字符时自动替换） */
export function getGameName(): string {
  const title = typeof document !== "undefined" ? document.title || "game" : "game";
  return title.replace(/[\\/:*?"<>|\r\n\t]/g, "_").slice(0, 60);
}

export function timestampFileName(prefix: string, ext: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const ts = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(
    d.getMinutes()
  )}`;
  return `${prefix}_${ts}.${ext}`;
}

export function downloadText(
  text: string,
  fileName: string,
  mime: string
): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Safari 上过早 revoke 会导致下载失败，延迟释放
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadJson(data: unknown, fileName: string): void {
  downloadText(JSON.stringify(data, null, 2), fileName, "application/json");
}

export function downloadDelimited(
  rows: Array<Array<string | number>>,
  fileName: string,
  delimiter: "," | "\t"
): void {
  // BOM：Excel 打开 CSV 不乱码
  const text = delimiter === "," ? "\uFEFF" + stringifyDelimited(rows, ",") : stringifyDelimited(rows, "\t");
  downloadText(
    text,
    fileName,
    delimiter === "," ? "text/csv;charset=utf-8" : "text/tab-separated-values"
  );
}
