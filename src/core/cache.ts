import config from '../config';
import { debounce, safeJSONParse } from '../utils';

type lastCache = {
  text: string;
  result: string;
}

class TranslatorCache {
  private cache: Map<string, string> = new Map();
  private learnedKeys: Set<string> = new Set();
  ignoretext: Set<string> = new Set();
  /** 最近被忽略（未命中）的文本，按插入顺序，避免每次 Array.from(整个 Set) */
  private recentIgnored: string[] = [];
  private static readonly MAX_RECENT_IGNORED = 500;
  private static readonly MAX_IGNORE = 20000;
  private static readonly MAX_SAVE_ENTRIES = 10000;
  private maxSize: number;
  private last1: lastCache | null = null;
  private last2: lastCache | null = null;
  private last3: lastCache | null = null;

  stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    ignoreHits: 0,
    lruEvictions: 0,
    learnedEntries: 0,
  };

  constructor(maxCacheSize?: number) {
    this.maxSize = maxCacheSize || config.user.maxCacheSize.userConfig || 20000;
  }

  /** 运行期调整容量上限（设置里的「最大缓存大小」改动后生效） */
  setMaxSize(size: number): void {
    const next = Math.max(100, Number(size) || this.maxSize);
    this.maxSize = next;
    while (this.cache.size > next) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
      this.learnedKeys.delete(oldestKey);
      this.stats.lruEvictions++;
    }
  }

  // ==================== 快速命中（3 级 LRU）====================

  private quickHit(text: string): string | undefined {
    if (this.last1 && (this.last1.text === text || this.last1.result === text)) {
      return this.last1.result;
    }
    if (this.last2 && (this.last2.text === text || this.last2.result === text)) {
      const tmp = this.last2;
      this.last2 = this.last1;
      this.last1 = tmp;
      return tmp.result;
    }
    if (this.last3 && (this.last3.text === text || this.last3.result === text)) {
      const tmp = this.last3;
      this.last3 = this.last2;
      this.last2 = this.last1;
      this.last1 = tmp;
      return tmp.result;
    }
    return undefined;
  }

  private quickSet(text: string, result: string) {
    this.last3 = this.last2;
    this.last2 = this.last1;
    this.last1 = { text, result };
  }

  // ==================== 公开 API ====================

  get(key: string): string | undefined {
    if (typeof key !== 'string') return undefined;
    const quick = this.quickHit(key);
    if (quick !== undefined) {
      this.stats.hits++;
      return quick;
    }
    const val = this.cache.get(key);
    if (val !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, val);
      this.quickSet(key, val);
      this.stats.hits++;
      return val;
    }
    this.stats.misses++;
    return undefined;
  }

  set(key: string, value: string, markLearned: boolean = false) {
    if (typeof key !== 'string' || typeof value !== 'string') return;
    if (key === value) return;
    // 空译文绝不能入缓存：否则后续命中会把游戏原文替换成空字符串
    if (value.length === 0) return;

    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
      this.learnedKeys.delete(oldestKey);
      this.stats.lruEvictions++;
    }
    this.cache.set(key, value);
    this.quickSet(key, value);
    this.stats.sets++;

    if (markLearned) {
      this.learnedKeys.add(key);
      this.stats.learnedEntries = this.learnedKeys.size;
    }
  }

  markLearned(key: string) {
    if (this.cache.has(key)) {
      this.learnedKeys.add(key);
      this.stats.learnedEntries = this.learnedKeys.size;
    }
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  isIgnored(text: string): boolean {
    if (typeof text !== 'string') return false;
    if (this.ignoretext.has(text)) {
      this.stats.ignoreHits++;
      return true;
    }
    return false;
  }

  addIgnore(text: string) {
    if (typeof text !== 'string' || text.length === 0) return;
    if (!this.ignoretext.has(text)) {
      // 无上限增长会吃满内存（长流程游戏可累积上万条未命中文本）
      if (this.ignoretext.size >= TranslatorCache.MAX_IGNORE) {
        const oldest = this.ignoretext.keys().next().value;
        if (oldest !== undefined) this.ignoretext.delete(oldest);
      }
      this.ignoretext.add(text);
    }
    this.recentIgnored.push(text);
    if (this.recentIgnored.length > TranslatorCache.MAX_RECENT_IGNORED) {
      this.recentIgnored.splice(0, this.recentIgnored.length - TranslatorCache.MAX_RECENT_IGNORED);
    }
  }

  removeIgnore(text: string) {
    this.ignoretext.delete(text);
    const i = this.recentIgnored.lastIndexOf(text);
    if (i >= 0) this.recentIgnored.splice(i, 1);
  }

  /** 取最近被忽略（未命中）的 n 条文本，供 AI 批量翻译挑选，避免每次遍历整个集合 */
  getRecentIgnored(n: number = 20): string[] {
    if (n <= 0) return [];
    const out = this.recentIgnored.slice(-n);
    if (out.length === 0 && this.ignoretext.size > 0) {
      // 兼容旧持久化数据：recentIgnored 为空时兜底取集合尾部
      let skip = this.ignoretext.size - n;
      if (skip < 0) skip = 0;
      let idx = 0;
      for (const k of this.ignoretext) {
        if (idx++ < skip) continue;
        out.push(k);
      }
    }
    return out;
  }

  clear() {
    this.cache.clear();
    this.learnedKeys.clear();
    this.ignoretext.clear();
    this.recentIgnored = [];
    this.last1 = null;
    this.last2 = null;
    this.last3 = null;
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.sets = 0;
    this.stats.ignoreHits = 0;
    this.stats.learnedEntries = 0;
  }

  get size(): number {
    return this.cache.size;
  }

  get ignoreSize(): number {
    return this.ignoretext.size;
  }

  get learnedSize(): number {
    return this.learnedKeys.size;
  }

  // ==================== 导出 / 导入 ====================

  exportJson(limit?: number): Record<string, string> {
    const obj: Record<string, string> = {};
    const total = this.cache.size;
    if (!limit || total <= limit) {
      for (const [k, v] of this.cache) obj[k] = v;
      return obj;
    }
    // 只保留最近的 limit 条（Map 迭代顺序 = 插入顺序，最新在末尾）
    let skip = total - limit;
    for (const [k, v] of this.cache) {
      if (skip-- > 0) continue;
      obj[k] = v;
    }
    return obj;
  }

  /** 持久化用快照：过滤空键/空值并限制条数，避免生成超大字符串 */
  private _snapshot(limit: number): Record<string, string> {
    const data = this.exportJson(limit);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k && v) out[k] = v;
    }
    return out;
  }

  exportEntries(): IterableIterator<[string, string]> {
    return this.cache.entries();
  }

  exportLearnedEntries(): Array<[string, string]> {
    const result: Array<[string, string]> = [];
    for (const key of this.learnedKeys) {
      const val = this.cache.get(key);
      if (val !== undefined) {
        result.push([key, val]);
      }
    }
    return result;
  }

  importJson(data: Record<string, string>) {
    this.clear();
    for (const [k, v] of Object.entries(data)) {
      this.set(k, v);
    }
  }

  // ==================== 持久化 ====================
  private _writeToStorage(key: string) {
    try {
      localStorage.setItem(key, JSON.stringify(this._snapshot(TranslatorCache.MAX_SAVE_ENTRIES)));
    } catch (e) {
      console.warn('[Cache] 保存失败:', e);
    }
  }

  /** 防抖保存（常规调用） */
  saveToStorage = debounce((key: string) => {
    this._writeToStorage(key);
  }, 2000);

  /** 立即保存（页面卸载 / 销毁时调用，防抖版本会丢数据） */
  saveToStorageNow(key: string) {
    this._writeToStorage(key);
  }

  loadFromStorage(key: string) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = safeJSONParse(raw);
      if (Array.isArray(data)) {
        data.forEach(([k, v]: [string, string]) => this.set(k, v));
      } else if (typeof data === 'object') {
        Object.entries(data).forEach(([k, v]) => this.set(k, String(v)));
      }
    } catch (e) {
      console.warn('[Cache] 加载失败:', e);
    }
  }

  get hitRate(): { hitRate: number; total: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      hitRate: total > 0 ? +(this.stats.hits / total * 100).toFixed(2) : 0,
      total,
    };
  }
}

const cache = new TranslatorCache();
export default cache;
