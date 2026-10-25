/**
 * infrastructure/metrics.ts — 轻量指标
 *
 * 热路径（每次文本翻译）上只做一次加法，绝不做遍历 / 对象分配。
 * stats 展示时才 snapshot，避免「每次算命中率都要遍历缓存」。
 */

import type { MetricsPort } from "../domain/ports";

export class Metrics implements MetricsPort {
  private counters = new Map<string, number>();

  inc(name: string, delta: number = 1): void {
    const next = (this.counters.get(name) ?? 0) + delta;
    this.counters.set(name, next);
  }

  get(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.counters) out[k] = v;
    return out;
  }

  reset(): void {
    this.counters.clear();
  }
}

export const METRIC = {
  TRANSLATE_CALLS: "translate.calls",
  TRANSLATE_SKIPPED: "translate.skipped",
  TRANSLATE_HIT_CACHE: "translate.hit.cache",
  TRANSLATE_HIT_EXACT: "translate.hit.exact",
  TRANSLATE_HIT_REGEX: "translate.hit.regex",
  TRANSLATE_MISS: "translate.miss",
  CACHE_HIT: "cache.hit",
  CACHE_MISS: "cache.miss",
  CACHE_EVICT: "cache.evict",
  AI_FIX_APPLIED: "aiFix.applied",
  AI_REQUEST: "ai.request",
  AI_BATCH: "ai.batch",
  HOOK_INSTALLED: "hook.installed",
} as const;
