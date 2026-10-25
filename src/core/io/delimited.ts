/**
 * io/delimited.ts — CSV / TSV 解析
 *
 *   1. 单次线性扫描的状态机，O(n)；
 *   2. 「引号内换行」；
 *   3. 转义引号 "" 与首尾空白处理统一在状态机里完成。
 */

export function parseDelimited(
  content: string,
  delimiter: string = ",",
  options: { trim?: boolean; skipEmpty?: boolean } = {}
): string[][] {
  const trim = options.trim ?? true;
  const skipEmpty = options.skipEmpty ?? true;
  const rows: string[][] = [];
  if (!content) return rows;

  const delim = delimiter.charCodeAt(0);
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;

  const pushField = () => {
    row.push(trim ? field.trim() : field);
    field = "";
    fieldStarted = false;
  };
  const pushRow = () => {
    pushField();
    const empty = row.length === 1 && row[0] === "";
    if (!empty || !skipEmpty) rows.push(row);
    row = [];
  };

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const code = content.charCodeAt(i);

    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      continue;
    }
    if (code === delim) {
      pushField();
      continue;
    }
    if (ch === "\r") {
      if (content[i + 1] === "\n") i++;
      pushRow();
      continue;
    }
    if (ch === "\n") {
      pushRow();
      continue;
    }
    field += ch;
    fieldStarted = true;
  }

  // 收尾：最后一行没有换行符时也要收进去
  if (field.length > 0 || row.length > 0 || fieldStarted) pushRow();
  return rows;
}

/** 序列化为 CSV/TSV（RFC4180：含分隔符/引号/换行的字段加引号） */
export function stringifyDelimited(
  rows: Array<Array<string | number>>,
  delimiter: string = ","
): string {
  const out: string[] = [];
  for (const row of rows) {
    const cells = row.map((cell) => {
      const s = String(cell ?? "");
      const needQuote =
        s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r");
      return needQuote ? `"${s.replace(/"/g, '""')}"` : s;
    });
    out.push(cells.join(delimiter));
  }
  return out.join("\n");
}
