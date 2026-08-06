import config from '../config';
import { debounce } from '../utils';

class TranslatorCache {
  private cache: Map<string, string> = new Map();
  ignoretext: Set<string> = new Set();
  private maxSize: number;

  private last1: Data.lastCache | null = null;
  private last2: Data.lastCache | null = null;
  private last3: Data.lastCache | null = null;

  stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    ignoreHits: 0,
    lruEvictions: 0,
  };

  constructor(maxCacheSize?: number) {
    this.maxSize = maxCacheSize || config.maxCacheSize || 30000;
  }

  private quickHit(text: string): string | undefined {
    if (this.last1 && (this.last1.text === text || this.last1.result === text)) {
      return this.last1.result;
    }
    if (this.last2 && (this.last2.text === text || this.last2.result === text)) {
      // 提升为 last1
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

  /** 查询缓存（先快速缓存，再主缓存） */
  get(key: string): string | undefined {
    // 1. 快速缓存
    const quick = this.quickHit(key);
    if (quick !== undefined) {
      this.stats.hits++;
      return quick;
    }
    // 2. 主缓存 LRU
    const val = this.cache.get(key);
    if (val !== undefined) {
      // 刷新 LRU 顺序
      this.cache.delete(key);
      this.cache.set(key, val);
      // 同步到快速缓存
      this.quickSet(key, val);
      this.stats.hits++;
      return val;
    }
    this.stats.misses++;
    return undefined;
  }

  set(key: string, value: string) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // LRU 淘汰
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
      this.stats.lruEvictions++;
    }
    this.cache.set(key, value);
    this.quickSet(key, value);
    this.stats.sets++;
  }

  isIgnored(text: string): boolean {
    if (this.ignoretext.has(text)) {
      this.stats.ignoreHits++;
      return true;
    }
    return false;
  }

  addIgnore(text: string) {
    this.ignoretext.add(text);
  }

  clear() {
    this.cache.clear();
    this.ignoretext.clear();
    this.last1 = null;
    this.last2 = null;
    this.last3 = null;
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.sets = 0;
    this.stats.ignoreHits = 0;
  }

  get size(): number {
    return this.cache.size;
  }

  get ignoreSize(): number {
    return this.ignoretext.size;
  }

  // ==================== 导出 / 导入 ====================

  exportJson(): Record<string, string> {
    const obj: Record<string, string> = {};
    // 按 LRU 顺序导出（最新在前）
    for (const [k, v] of this.cache) {
      obj[k] = v;
    }
    return obj;
  }

  importJson(data: Record<string, string>) {
    this.clear();
    const entries = Object.entries(data);
    for (const [k, v] of entries) {
      this.set(k, v);
    }
  }

  // ==================== 持久化 ====================
  saveCacheToStorage = debounce((key: string) => {
    try {
      const data = JSON.stringify(this.exportJson());
      // 尝试压缩（如果数据太大）
      if (data.length > 4_000_000) {
        console.warn('[Cache] 缓存数据过大，仅保存最近 10000 条');
        const trimmed: Record<string, string> = {};
        let count = 0;
        for (const [k, v] of this.cache) {
          if (count++ >= 10000) break;
          trimmed[k] = v;
        }
        localStorage.setItem(key, JSON.stringify(trimmed));
      } else {
        localStorage.setItem(key, data);
      }
    } catch (e) {
      console.warn('[Cache] 保存失败（可能超出存储配额）:', e);
    }
  }, 2000);

  loadStorageCache(key: string) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        data.forEach(([k, v]) => this.set(k, v));
      } else if (typeof data === 'object') {
        Object.entries(data).forEach(([k, v]) => this.set(k, String(v)));
      }
    } catch (e) {
      console.warn('[Cache] 加载失败:', e);
    }
  }

  getHitRate(): { hitRate: number; total: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      hitRate: total > 0 ? +(this.stats.hits / total * 100).toFixed(2) : 0,
      total,
    };
  }
}

const cache = new TranslatorCache();
export default cache;