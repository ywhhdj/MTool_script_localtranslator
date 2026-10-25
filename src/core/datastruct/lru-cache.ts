/**
 * datastruct/lru-cache.ts — LRU 缓存与翻译缓存
 *
 *   1. learned 与 cache 生命周期一致；
 *   2. 用 LruCache 承载，天然有界；
 *   3. 保留 3 级快命中缓存，避免重复查询
 *   4. 空译文不得入缓存
 */

export class LruCache<V> {
  private map = new Map<string, V>();
  private maxSize: number;
  private evictions = 0;
  private onEvict?: (key: string, value: V) => void;

  constructor(maxSize: number = 10000, onEvict?: (key: string, value: V) => void) {
    this.maxSize = Math.max(16, Math.floor(maxSize));
    this.onEvict = onEvict;
  }

  get size(): number {
    return this.map.size;
  }

  get evictionCount(): number {
    return this.evictions;
  }

  get capacity(): number {
    return this.maxSize;
  }

  setCapacity(n: number): void {
    this.maxSize = Math.max(16, Math.floor(n));
    this.prune();
  }

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    // Map 保序：delete + set 把命中项挪到末尾（最新）
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  peek(key: string): V | undefined {
    return this.map.get(key);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    this.prune();
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  keys(): IterableIterator<string> {
    return this.map.keys();
  }

  entries(): IterableIterator<[string, V]> {
    return this.map.entries();
  }

  /** 取末尾 n 条（最近使用） */
  tail(n: number): Array<[string, V]> {
    if (n <= 0) return [];
    const out: Array<[string, V]> = [];
    let skip = this.map.size - n;
    if (skip < 0) skip = 0;
    for (const [k, v] of this.map) {
      if (skip-- > 0) continue;
      out.push([k, v]);
    }
    return out;
  }

  private prune(): void {
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      const value = this.map.get(oldest)!;
      this.map.delete(oldest);
      this.evictions++;
      this.onEvict?.(oldest, value);
    }
  }
}

export interface TranslationCacheStats {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  learned: number;
  ignored: number;
}

export interface TranslationCacheOptions {
  maxEntries?: number;
  maxIgnored?: number;
  maxRecentIgnored?: number;
}

/**
 * 翻译结果缓存：译文 LRU + 忽略（未命中）LRU + 学习标记。
 * 三层都在同一个对象里，避免「缓存淘汰了但标记还在」的不一致。
 */
export class TranslationCache {
  private results: LruCache<string>;
  private ignored: LruCache<true>;
  private learned = new Set<string>();
  private recentIgnored: string[] = [];
  private maxRecentIgnored: number;
  private last1: { k: string; v: string } | null = null;
  private last2: { k: string; v: string } | null = null;
  private last3: { k: string; v: string } | null = null;

  stats: TranslationCacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0,
    learned: 0,
    ignored: 0,
  };

  constructor(options: TranslationCacheOptions = {}) {
    this.maxRecentIgnored = options.maxRecentIgnored ?? 500;
    this.results = new LruCache<string>(options.maxEntries ?? 20000, () => {
      this.stats.evictions++;
    });
    this.ignored = new LruCache<true>(options.maxIgnored ?? 20000);
  }

  // ==================== 容量 ====================

  get size(): number {
    return this.results.size;
  }

  get ignoreSize(): number {
    return this.ignored.size;
  }

  get learnedSize(): number {
    return this.learned.size;
  }

  setMaxSize(n: number): void {
    this.results.setCapacity(n);
  }

  // ==================== 译文 ====================

  get(key: string): string | undefined {
    if (typeof key !== "string") return undefined;
    const quick = this.quickHit(key);
    if (quick !== undefined) {
      this.stats.hits++;
      return quick;
    }
    const v = this.results.get(key);
    if (v !== undefined) {
      this.quickSet(key, v);
      this.stats.hits++;
      return v;
    }
    this.stats.misses++;
    return undefined;
  }

  set(key: string, value: string, markLearned = false): void {
    if (typeof key !== "string" || typeof value !== "string") return;
    if (key === value) return;
    if (value.length === 0) return; // 空译文绝不入缓存
    this.results.set(key, value);
    this.quickSet(key, value);
    this.stats.sets++;
    if (markLearned && !this.learned.has(key)) {
      this.learned.add(key);
      this.stats.learned = this.learned.size;
    }
    this.ignored.delete(key); // 命中后不再是「未命中」
  }

  has(key: string): boolean {
    return this.results.has(key);
  }

  markLearned(key: string): void {
    if (!this.results.has(key)) return;
    if (this.learned.has(key)) return;
    this.learned.add(key);
    this.stats.learned = this.learned.size;
  }

  learnedEntries(): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (const key of this.learned) {
      const v = this.results.peek(key);
      if (v !== undefined) out.push([key, v]);
    }
    return out;
  }

  // ==================== 忽略表 ====================

  isIgnored(text: string): boolean {
    if (typeof text !== "string") return false;
    const hit = this.ignored.has(text);
    if (hit) this.stats.ignored++;
    return hit;
  }

  addIgnore(text: string): void {
    if (typeof text !== "string" || text.length === 0) return;
    this.ignored.set(text, true);
    this.recentIgnored.push(text);
    if (this.recentIgnored.length > this.maxRecentIgnored) {
      this.recentIgnored.splice(0, this.recentIgnored.length - this.maxRecentIgnored);
    }
  }

  removeIgnore(text: string): void {
    this.ignored.delete(text);
  }

  recentIgnoredTexts(n: number): string[] {
    if (n <= 0) return [];
    return this.recentIgnored.slice(-n);
  }

  // ==================== 导入导出 ====================

  exportEntries(limit?: number): Array<[string, string]> {
    if (!limit) return Array.from(this.results.entries());
    return this.results.tail(limit);
  }

  importEntries(data: Record<string, string> | Array<[string, string]>): number {
    let count = 0;
    const apply = (k: string, v: string) => {
      if (!k || !v) return;
      this.results.set(k, v);
      count++;
    };
    if (Array.isArray(data)) {
      for (const [k, v] of data) apply(k, v);
    } else if (data && typeof data === "object") {
      for (const [k, v] of Object.entries(data)) apply(k, String(v));
    }
    return count;
  }

  clear(): void {
    this.results.clear();
    this.ignored.clear();
    this.learned.clear();
    this.recentIgnored = [];
    this.last1 = this.last2 = this.last3 = null;
    this.stats = { hits: 0, misses: 0, sets: 0, evictions: 0, learned: 0, ignored: 0 };
  }

  get hitRate(): { hitRate: number; total: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      hitRate: total > 0 ? +((this.stats.hits / total) * 100).toFixed(2) : 0,
      total,
    };
  }

  // ==================== 内部：3 级快命中 ====================

  private quickHit(key: string): string | undefined {
    const l1 = this.last1;
    if (l1 && (l1.k === key || l1.v === key)) return l1.v;
    const l2 = this.last2;
    if (l2 && (l2.k === key || l2.v === key)) {
      this.last2 = l1;
      this.last1 = l2;
      return l2.v;
    }
    const l3 = this.last3;
    if (l3 && (l3.k === key || l3.v === key)) {
      this.last3 = l2;
      this.last2 = l1;
      this.last1 = l3;
      return l3.v;
    }
    return undefined;
  }

  private quickSet(key: string, value: string): void {
    this.last3 = this.last2;
    this.last2 = this.last1;
    this.last1 = { k: key, v: value };
  }
}
