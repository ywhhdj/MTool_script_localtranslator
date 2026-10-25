/**
 * datastruct/bloom-filter.ts — Bloom Filter（前置过滤）
 *
 *   1. 位索引： 统一为「一个 0..bitCount-1 的位下标 → word/bit」；
 *   2. 只在容量不足时重建并明确清空；
 *   3. 现在提供 insertions 与 fillRatio，
 *      并给出估算误判率，便于在 UI 上判断「该重建了」
 *   4. add 时对空值直接忽略
 */

export class BloomFilter {
  private bits: Uint32Array;
  private bitCount: number;
  private insertions = 0;
  private bitsPerItem: number;
  private probes = 3;

  constructor(expectedItems: number = 1024, bitsPerItem: number = 12) {
    this.bitsPerItem = Math.max(4, bitsPerItem);
    this.bitCount = BloomFilter.bitCountFor(expectedItems, this.bitsPerItem);
    this.bits = new Uint32Array(Math.ceil(this.bitCount / 32));
  }

  static bitCountFor(items: number, bitsPerItem: number): number {
    const need = Math.max(1024, Math.ceil(Math.max(1, items) * bitsPerItem));
    // 对齐到 32 的倍数，避免最后一段 word 浪费
    return Math.ceil(need / 32) * 32;
  }

  /** 预留容量：不足时才重建（会清空已有数据） */
  reserve(expectedItems: number): void {
    const need = BloomFilter.bitCountFor(expectedItems, this.bitsPerItem);
    if (need <= this.bitCount) return;
    this.bitCount = need;
    this.bits = new Uint32Array(Math.ceil(need / 32));
    this.insertions = 0;
  }

  add(value: string): void {
    if (!value || typeof value !== "string") return;
    const [h1, h2] = BloomFilter.hashPair(value);
    const total = this.bitCount;
    for (let i = 0; i < this.probes; i++) {
      const pos = (h1 + Math.imul(i, h2)) % total;
      const word = pos >>> 5;
      this.bits[word] |= 1 << (pos & 31);
    }
    this.insertions++;
  }

  addAll(values: Iterable<string>): void {
    if (!values) return;
    for (const v of values) this.add(v);
  }

  mightContain(value: string): boolean {
    if (!value || typeof value !== "string") return false;
    const [h1, h2] = BloomFilter.hashPair(value);
    const total = this.bitCount;
    for (let i = 0; i < this.probes; i++) {
      const pos = (h1 + Math.imul(i, h2)) % total;
      const word = pos >>> 5;
      if ((this.bits[word] & (1 << (pos & 31))) === 0) return false;
    }
    return true;
  }

  clear(): void {
    this.bits.fill(0);
    this.insertions = 0;
  }

  get count(): number {
    return this.insertions;
  }

  get byteSize(): number {
    return this.bits.byteLength;
  }

  /** 置位比例：接近 1 说明该重建/扩容了 */
  get fillRatio(): number {
    let set = 0;
    for (let i = 0; i < this.bits.length; i++) {
      let v = this.bits[i];
      // Brian Kernighan 位计数
      while (v) {
        v &= v - 1;
        set++;
      }
    }
    return this.bitCount ? set / this.bitCount : 0;
  }

  estimatedFalsePositiveRate(): number {
    const ratio = this.fillRatio;
    return Math.pow(ratio, this.probes);
  }

  /** FNV-1a + DJB2：一次遍历同时算出两个 32 位哈希 */
  private static hashPair(s: string): [number, number] {
    let h1 = 2166136261 >>> 0;
    let h2 = 5381;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = (Math.imul(h2, 33) + c) >>> 0;
    }
    return [h1 >>> 0, h2 >>> 0];
  }
}
