/**
 * io/format-detector.ts — 「这个文件是翻译规则还是 aaa/bbb/ccc」的判定
 *
 * 单一职责：只做判定，不做加载。
 */

export type FileKind = "translation" | "aiFix" | "mixed";

const HEADER_TRANSLATION = ["source", "target", "src", "原文", "译文"];
const HEADER_AIFIX = ["aaa", "bbb", "ccc"];

export function detectKind(rows: any[][], sampleSize: number = 30): FileKind {
  const valid = (rows || []).filter(
    (r) => Array.isArray(r) && r.length >= 2 && r[0] && String(r[0]).trim()
  );
  if (valid.length === 0) return "translation";

  // 表头优先
  const first = valid[0].map((c) => String(c ?? "").trim().toLowerCase());
  if (first.length >= 3 && HEADER_AIFIX.every((h) => first.includes(h))) return "aiFix";
  if (first.length >= 2 && HEADER_TRANSLATION.some((h) => first.includes(h))) return "translation";

  const sample = Math.min(sampleSize, valid.length);
  let three = 0;
  let two = 0;
  for (let i = 0; i < sample; i++) {
    const row = valid[i];
    if (row.length >= 3 && String(row[2] ?? "").trim()) three++;
    else if (row.length >= 2 && String(row[1] ?? "").trim()) two++;
  }

  if (three > sample * 0.6) return "aiFix";
  if (three > 0 && two > 0) return "mixed";
  return "translation";
}

export function filterValidRows(rows: any[][]): any[][] {
  return (rows || []).filter(
    (r) => Array.isArray(r) && r.length >= 2 && r[0] && String(r[0]).trim()
  );
}
