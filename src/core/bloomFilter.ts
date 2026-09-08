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

  // 复用 hash 结果，避免每次 add / mightContain 都分配临时对象
  private static _h1: number = 0;
  private static _h2: number = 0;

  constructor(size?: number) {
    this.size = size || 2048;
    this.bits = new Uint32Array(this.size);
  }

  /**
   * 按期望元素数预留容量（约 10 bit/元素，误判率 ~2%）。
   * 仅在需要的容量大于当前容量时重建，已插入的数据会丢失，调用方需自行重建。
   */
  reserve(expectedItems: number): void {
    if (!expectedItems || expectedItems <= 0) return;
    const needed = Math.max(2048, Math.ceil((expectedItems * 10) / 32));
    if (needed > this.size) {
      this.size = needed;
      this.bits = new Uint32Array(needed);
      this._count = 0;
    }
  }

  add(str: string): void {
    if (!str || typeof str !== 'string') return;
    TinyBloom._hashPair(str);
    const h1 = TinyBloom._h1;
    const h2 = TinyBloom._h2;
    for (let i = 0; i < 3; i++) {
      const idx = ((h1 + i * h2) >>> 0) % this.size;
      const bitPos = ((h1 + i * h2 * 7) >>> 0) & 31;
      this.bits[idx] |= (1 << bitPos);
    }
    this._count++;
  }

  addAll(strings: Iterable<string>): void {
    if (!strings) return;
    for (const s of strings) this.add(s);
  }

  /**
   * 判断字符串"可能存在于"集合中
   * @returns false = 一定不存在（安全跳过）
   *          true  = 可能存在（需进一步精确查询）
   */
  mightContain(str: string): boolean {
    if (!str || typeof str !== 'string') return false;
    TinyBloom._hashPair(str);
    const h1 = TinyBloom._h1;
    const h2 = TinyBloom._h2;
    for (let i = 0; i < 3; i++) {
      const idx = ((h1 + i * h2) >>> 0) % this.size;
      const bitPos = ((h1 + i * h2 * 7) >>> 0) & 31;
      if (!(this.bits[idx] & (1 << bitPos))) {
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

  // ========== FNV-1a(32-bit) + DJB2(32-bit)，一次遍历同时算出两个哈希 ==========
  private static _hashPair(s: string): void {
    let h1 = 2166136261 >>> 0;
    let h2 = 5381;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;   // Math.imul 确保 32-bit 溢出乘法
      h2 = ((h2 << 5) + h2 + c) >>> 0;
    }
    TinyBloom._h1 = h1 >>> 0;
    TinyBloom._h2 = h2 >>> 0;
  }
}
