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
    if (typeof text === 'string') {
      this.ignoretext.add(text);
    }
  }

  removeIgnore(text: string) {
    this.ignoretext.delete(text);
  }

  clear() {
    this.cache.clear();
    this.learnedKeys.clear();
    this.ignoretext.clear();
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

  exportJson(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [k, v] of this.cache) {
      obj[k] = v;
    }
    return obj;
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
  saveToStorage = debounce((key: string) => {
    try {
      const data = this.exportJson();
      const trimmed = JSON.stringify(Object.fromEntries(
        Object.entries(data).filter(([k, v]) => k && v)
      ));
      if (trimmed.length > 4_000_000) {
        console.warn('[Cache] 缓存数据过大，仅保存最近 10000 条');
        const trimmed: Record<string, string> = {};
        let count = 0;
        for (const [k, v] of this.cache) {
          if (count++ >= 10000) break;
          trimmed[k] = v;
        }
        localStorage.setItem(key, JSON.stringify(trimmed));
      } else {
        localStorage.setItem(key, trimmed);
      }
    } catch (e) {
      console.warn('[Cache] 保存失败:', e);
    }
  }, 2000);

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