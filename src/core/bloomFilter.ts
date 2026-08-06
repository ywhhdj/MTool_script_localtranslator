/**
 * TinyBloom — 轻量级 Bloom Filter
 * 
 * 用途：在翻译引擎中做 O(1) 前置过滤，
 *       快速判断文本"是否可能存在于"规则集中。
 * 
 * 特点：
 *   - 2 个独立哈希函数（FNV-1a + DJB2）
 *   - 3 次探针（probe）
 *   - 默认 2048 个 uint32 = 8KB 内存
 *   - 误判率约 1~3%（仅作为前置过滤，可接受）
 *   - 确定"不存在"时 100% 准确
 */

export class TinyBloom {
  private bits: Uint32Array;
  private size: number;
  private _count: number = 0;

  constructor(size?: number) {
    this.size = size || 2048;
    this.bits = new Uint32Array(this.size);
  }

  add(str: string): void {
    const h1 = TinyBloom._hash1(str);
    const h2 = TinyBloom._hash2(str);
    for (let i = 0; i < 3; i++) {
      const idx = (h1 + i * h2) % this.size;
      this.bits[idx] |= (1 << ((h1 + i * h2 * 7) & 31));
    }
    this._count++;
  }

  addAll(strings: Iterable<string>): void {
    for (const s of strings) this.add(s);
  }

  /**
   * 判断字符串"可能存在于"集合中
   * @returns false = 一定不存在（安全跳过）
   *          true  = 可能存在（需进一步精确查询）
   */
  mightContain(str: string): boolean {
    const h1 = TinyBloom._hash1(str);
    const h2 = TinyBloom._hash2(str);
    for (let i = 0; i < 3; i++) {
      const idx = (h1 + i * h2) % this.size;
      if (!(this.bits[idx] & (1 << ((h1 + i * h2 * 7) & 31)))) {
        return false;
      }
    }
    return true;
  }

  clear(): void {
    this.bits.fill(0);
    this._count = 0;
  }

  get count(): number {
    return this._count;
  }

  get byteSize(): number {
    return this.bits.byteLength;
  }

  // ========== FNV-1a 32-bit ==========
  private static _hash1(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // ========== DJB2 32-bit ==========
  private static _hash2(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    }
    return h >>> 0;
  }
}
