import Config from "./config";

class LocalTranslatorCache {
  cache: Map<string, any> = new Map();
  maxSize: number;
  ignoretext: Set<string> = new Set();
  lastText: string | null = null;
  lastRusult: string | null = null;
  lastText2: string | null = null;
  lastRusult2: string | null = null;
  lastText3: string | null = null;
  lastRusult3: string | null = null;

  constructor(maxCacheSize = 20000) {
    this.maxSize = maxCacheSize;
  }

  textCacheSet(text: string, result: string) {
    this.lastText3 = this.lastText2;
    this.lastRusult3 = this.lastRusult2;
    this.lastText2 = this.lastText;
    this.lastRusult2 = this.lastRusult;
    this.lastText = text;
    this.lastRusult = result;
  }

  textCacheQurey(text: string): string | undefined {
    if (text === this.lastText || text === this.lastRusult) {
      return this.lastRusult as string;
    }
    if (text === this.lastText2 || text === this.lastRusult2) {
      const targetT = this.lastText2;
      const targetR = this.lastRusult2;
      this.lastText2 = this.lastText;
      this.lastRusult2 = this.lastRusult;
      this.lastText = targetT;
      this.lastRusult = targetR;
      return targetR as string;
    }
    if (text === this.lastText3 || text === this.lastRusult3) {
      const targetT = this.lastText3 as string;
      const targetR = this.lastRusult3 as string;
      this.textCacheSet(targetT, targetR);
      return targetR as string;
    }
    return undefined;
  }

  get(key: string): string | undefined {
    const item = this.cache.get(key);
    if (item) {
      this.cache.delete(key);
      this.cache.set(key, item);
      return item;
    }
    return undefined;
  }

  set(key: string, value: string) {
    if (this.cache.size >= this.maxSize) {
      this.cache.delete(this.cache.keys().下一处().value!);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
    this.ignoretext.clear();
    this.lastText = null;
    this.lastRusult = null;
    this.lastText2 = null;
    this.lastRusult2 = null;
    this.lastText3 = null;
    this.lastRusult3 = null;
  }

  exportJson() {
    const obj: Record<string, any> = {};
    for (const [k, v] of this.cache) {
      obj[k] = v;
    }
    return obj;
  }

  saveCacheToStorage(key: string) {
    const data = this.exportJson();
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn("Storage full, cannot save cache");
    }
  }

  loadStorageCache(key: string) {
    let data = localStorage.getItem(key);
    if (data) {
      try {
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
        if (Array.isArray(parsedData)) {
          parsedData.forEach(([k, v]) => this.set(k, v));
        } else {
          Object.entries(parsedData).forEach(([k, v]) => this.set(k, v as string));
        }
      } catch (e) {
        console.warn("Error parsing cache data");
      }
    }
  }
}
const Cache = new LocalTranslatorCache(Config.maxCacheSize);
export default Cache;
