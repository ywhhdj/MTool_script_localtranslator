/**
 * text/normalizer.ts — 文本归一化与分段
 *
 *   1. 每次迭代用局部正则，实例本身不保留匹配状态；
 *   2. 实例注入，便于测试与多语言表切换；
 *   3. 分段结果带类型标记，调用方无需再用正则二次切分。
 */

export type Segment = {
  type: "text" | "control";
  value: string;
};

const CONTROL_SOURCE =
  "\\\\[A-Za-z](?:\\[[^\\]]*\\])?|\\x1b\\[[\\d;]*[A-Za-z]";
const CONTROL_ONLY_SOURCE =
  "^(?:\\\\[A-Za-z](?:\\[[^\\]]*\\])?|\\x1b\\[[\\d;]*[A-Za-z])$";
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function escapeForClass(chars: string[]): string {
  return chars.map((c) => c.replace(/[.*+?^${}()|[\]\\\-]/g, "\\$&")).join("");
}

export class TextNormalizer {
  private readonly punctRe: RegExp | null;
  private readonly punctMap: Record<string, string>;
  private readonly controlRe: RegExp;
  private readonly controlOnlyRe: RegExp;

  constructor(punctuation: Record<string, string> = {}) {
    this.punctMap = punctuation || {};
    const chars = Object.keys(this.punctMap);
    this.punctRe = chars.length ? new RegExp(`[${escapeForClass(chars)}]`, "g") : null;
    this.controlRe = new RegExp(CONTROL_SOURCE, "g");
    this.controlOnlyRe = new RegExp(CONTROL_ONLY_SOURCE);
  }

  /** 控制符（含 RPG Maker 的 \C[1]、\N[1] 与 ANSI 序列） */
  get controlPattern(): RegExp {
    return this.controlRe;
  }

  stripControlChars(text: unknown): string {
    if (text === null || text === undefined) return "";
    const s = typeof text === "string" ? text : String(text);
    return s.replace(CONTROL_CHARS_RE, "");
  }

  /** 标点归一：无映射表时直接返回，避免一次无谓的 replace 遍历 */
  normalize(text: string): string {
    if (!text || typeof text !== "string") return text;
    if (!this.punctRe) return text;
    this.punctRe.lastIndex = 0;
    return text.replace(this.punctRe, (ch) => this.punctMap[ch] ?? ch);
  }

  hasControlChars(text: string): boolean {
    if (!text) return false;
    // 用无 g 标志的副本做检测，避免影响外部持有的正则状态
    return new RegExp(CONTROL_SOURCE).test(text);
  }

  isControlOnly(text: string): boolean {
    if (!text) return false;
    return this.controlOnlyRe.test(text);
  }

  /**
   * 按控制符切分。返回空数组表示「纯文本、无需分段」，
   * 调用方可以直接走快路径。
   */
  split(text: string): Segment[] {
    if (!text) return [];
    const re = new RegExp(CONTROL_SOURCE, "g");
    const segments: Segment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex++; // 防御零宽匹配导致的死循环
        continue;
      }
      if (match.index > lastIndex) {
        segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
      }
      segments.push({ type: "control", value: match[0] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      segments.push({ type: "text", value: text.slice(lastIndex) });
    }
    // 只有一个 text 段 → 调用方无需拼接
    if (segments.length === 1 && segments[0].type === "text") return [];
    return segments;
  }

  /** 拼接分段结果（仅翻译 text 段） */
  join(segments: Segment[], translate: (text: string) => string): string {
    let out = "";
    for (const seg of segments) {
      out += seg.type === "control" ? seg.value : translate(seg.value);
    }
    return out;
  }
}
