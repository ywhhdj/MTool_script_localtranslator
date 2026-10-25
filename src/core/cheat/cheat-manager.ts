/**
 * cheat/cheat-manager.ts — 修改器管理器
 *
 *   1. 补丁注册表复用 hooks/hook-registry（点路径还原、幂等、异常回落），
 *      不再维护第二套几乎相同的实现；
 *   2. 配置持久化走注入的 KeyValueStorePort（带前缀，不会误删游戏存档）；
 *   3. 恢复配置时按域合并 + 数值区间校验（NaN / 负数 / 超界一律回落默认）；
 */

import { reactive } from "vue";
import { PrototypeHookRegistry } from "../hooks/hook-registry";
import type { KeyValueStorePort, LoggerPort, SchedulerPort } from "../domain/ports";
import type { Disposable } from "../domain/disposable";
import {
  getAdapter,
  resolveEngineKey,
  listEngines,
  detectedRenderEngines,
} from "./engines";
import type { CheatCapability, CheatEngineKey, CheatStats } from "./types";

const STORAGE_KEY = "CheatSettings";

export const DEFAULT_CHEAT_SETTINGS: Options.CheatSettings = {
  enabled: false,
  engine: "auto",
  gold: {
    enabled: true,
    multiplier: 10,
    minGain: 0,
    maxGold: 9999999999,
    setValue: 100000,
  },
  actor: {
    expEnabled: true,
    expMultiplier: 2,
    paramEnabled: true,
    paramBaseMultiplier: 2,
    paramPlusMultiplier: 2,
    paramMaxEnabled: true,
    paramMax: 999999,
    levelMaxEnabled: true,
    levelMax: 99,
  },
  item: {
    enabled: true,
    multiplier: 5,
    maxItems: 99999,
    dropEnabled: false,
    dropMultiplier: 2,
    guaranteedDrop: true,
    giveAmount: 99,
  },
  generic: { enabled: false, script: "" },
};

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function clampNumber(v: any, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export class CheatManager implements Disposable {
  public settings = reactive<Options.CheatSettings>(deepClone(DEFAULT_CHEAT_SETTINGS));
  private registry = new PrototypeHookRegistry();
  private appliedEngine: string | null = null;
  private patched: string[] = [];
  private logger: LoggerPort;
  private storage: KeyValueStorePort | null = null;
  private scheduler: SchedulerPort | null = null;
  private saveDebounced: {
    cancel(): void;
    flush(): void
  } | null = null;

  constructor(deps: { logger: LoggerPort; storage?: KeyValueStorePort; scheduler?: SchedulerPort }) {
    this.logger = deps.logger;
    this.storage = deps.storage ?? null;
    this.scheduler = deps.scheduler ?? null;
    this.loadFromStorage();
  }

  // ==================== 引擎 ====================

  engines() {
    return listEngines();
  }

  currentEngineKey(): string {
    return resolveEngineKey(this.settings.engine as CheatEngineKey);
  }

  currentEngine() {
    const key = this.currentEngineKey();
    return this.engines().find((e) => e.key === key) || null;
  }

  supports(cap: CheatCapability): boolean {
    const engine = this.currentEngine();
    if (!engine) return false;
    if (engine.key === "generic") return true; // 自定义脚本不声明能力
    return engine.capabilities.includes(cap);
  }

  renderOnlyEngines(): string[] {
    return detectedRenderEngines();
  }

  hasRuntime(): boolean {
    const w = window as any;
    return Boolean(w.$gameParty || w.$gameActors);
  }

  // ==================== 应用 / 还原 ====================

  apply(): CheatStats {
    this.revert();
    const key = this.currentEngineKey();
    const adapter = getAdapter(key);
    if (!adapter) {
      this.logger.error(`[Cheat] 未找到引擎适配器: ${key}`);
      return this.getStats();
    }
    if (!adapter.detect() && key !== "generic") {
      this.logger.warn(`[Cheat] ${adapter.name} 未检测到，未注入（可切换为自定义脚本）`);
      this.settings.enabled = false;
      return this.getStats();
    }
    this.patched = adapter.apply(this.settings, this.registry);
    this.appliedEngine = key;
    this.settings.enabled = true;
    this.saveToStorage();
    this.logger.success(`[Cheat] 已应用 [${adapter.name}]：${this.patched.length} 个注入点`);
    return this.getStats();
  }

  revert(): number {
    const adapter = this.appliedEngine ? getAdapter(this.appliedEngine) : null;
    adapter?.revert(this.registry);
    const rest = this.registry.dispose(); // 兜底：清掉所有遗漏
    this.appliedEngine = null;
    this.patched = [];
    if (rest > 0) this.logger.info(`[Cheat] 修改器已还原（${rest} 个注入点）`);
    return rest;
  }

  toggle(enabled?: boolean): CheatStats {
    const next = enabled === undefined ? !this.settings.enabled : enabled;
    if (next) return this.apply();
    this.revert();
    this.settings.enabled = false;
    this.saveToStorage();
    return this.getStats();
  }

  setEngine(engine: CheatEngineKey): CheatStats {
    this.settings.engine = engine;
    this.saveToStorage();
    return this.settings.enabled ? this.apply() : this.getStats();
  }

  // ==================== 快捷动作 ====================

  private party(): any {
    return (window as any).$gameParty || null;
  }

  setGold(value: number): boolean {
    const party = this.party();
    if (!party) {
      this.logger.warn("[Cheat] $gameParty 不存在，无法设定金币");
      return false;
    }
    const v = Math.max(0, Math.round(Number(value) || 0));
    party._gold = v;
    try {
      (window as any).$gameMap?.requestRefresh?.();
    } catch {
      /* 地图未就绪 */
    }
    this.logger.success(`[Cheat] 金币已设为 ${v}`);
    return true;
  }

  maxLevel(): boolean {
    const party = this.party();
    if (!party || typeof party.members !== "function") {
      this.logger.warn("[Cheat] $gameParty 不存在，无法满级");
      return false;
    }
    const level = clampNumber(this.settings.actor.levelMax, 1, 999, 99);
    let count = 0;
    for (const actor of party.members()) {
      try {
        if (typeof actor.changeLevel === "function") actor.changeLevel(level, false);
        else actor._level = level;
        if (typeof actor.recoverAll === "function") actor.recoverAll();
        count++;
      } catch {
        /* 单个角色失败不影响其他 */
      }
    }
    this.logger.success(`[Cheat] ${count} 名角色已设为 Lv${level}`);
    return count > 0;
  }

  giveAllItems(amount?: number): boolean {
    const w = window as any;
    const party = this.party();
    if (!party || typeof party.gainItem !== "function") {
      this.logger.warn("[Cheat] $gameParty 不存在，无法发放物品");
      return false;
    }
    const fallback = Number(this.settings.item.giveAmount) || 99;
    const n = Math.max(1, Math.round(amount ?? fallback));
    let count = 0;
    for (const list of [w.$dataItems, w.$dataWeapons, w.$dataArmors]) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!item || item.name === undefined) continue;
        try {
          party.gainItem(item, n, false);
          count++;
        } catch {
          /* 单个道具失败忽略 */
        }
      }
    }
    this.logger.success(`[Cheat] 已发放 ${count} 种道具 ×${n}`);
    return count > 0;
  }

  recoverAll(): boolean {
    const party = this.party();
    if (!party || typeof party.members !== "function") {
      this.logger.warn("[Cheat] $gameParty 不存在，无法回满");
      return false;
    }
    let count = 0;
    for (const actor of party.members()) {
      try {
        if (typeof actor.recoverAll === "function") actor.recoverAll();
        count++;
      } catch {
        /* ignore */
      }
    }
    this.logger.success(`[Cheat] ${count} 名角色已回满`);
    return count > 0;
  }

  // ==================== 持久化 ====================

  attachStorage(storage: KeyValueStorePort): void {
    this.storage = storage;
  }

  saveToStorage(): void {
    if (!this.storage) return;
    const write = () =>
      this.storage!.set(STORAGE_KEY, JSON.stringify(JSON.parse(JSON.stringify(this.settings))));
    if (!this.scheduler) {
      write();
      return;
    }
    if (!this.saveDebounced) this.saveDebounced = this.scheduler.debounce(write, 400);
    this.saveDebounced();
  }

  loadFromStorage(): void {
    if (!this.storage) return;
    const raw = this.storage.get(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const d = DEFAULT_CHEAT_SETTINGS;
      const next: Options.CheatSettings = {
        enabled: parsed.enabled === true,
        engine: (["auto", "rpgmaker", "generic"] as CheatEngineKey[]).includes(parsed.engine)
          ? parsed.engine
          : d.engine,
        gold: {
          enabled: parsed.gold?.enabled !== false,
          multiplier: clampNumber(parsed.gold?.multiplier, 1, 10000, d.gold.multiplier),
          minGain: clampNumber(parsed.gold?.minGain, 0, 1e12, d.gold.minGain),
          maxGold: clampNumber(parsed.gold?.maxGold, 0, 1e12, d.gold.maxGold),
          setValue: clampNumber(parsed.gold?.setValue, 0, 1e12, d.gold.setValue),
        },
        actor: {
          expEnabled: parsed.actor?.expEnabled !== false,
          expMultiplier: clampNumber(parsed.actor?.expMultiplier, 1, 10000, d.actor.expMultiplier),
          paramEnabled: parsed.actor?.paramEnabled !== false,
          paramBaseMultiplier: clampNumber(
            parsed.actor?.paramBaseMultiplier,
            1,
            10000,
            d.actor.paramBaseMultiplier
          ),
          paramPlusMultiplier: clampNumber(
            parsed.actor?.paramPlusMultiplier,
            1,
            10000,
            d.actor.paramPlusMultiplier
          ),
          paramMaxEnabled: parsed.actor?.paramMaxEnabled !== false,
          paramMax: clampNumber(parsed.actor?.paramMax, 1, 1e9, d.actor.paramMax),
          levelMaxEnabled: parsed.actor?.levelMaxEnabled !== false,
          levelMax: clampNumber(parsed.actor?.levelMax, 1, 999, d.actor.levelMax),
        },
        item: {
          enabled: parsed.item?.enabled !== false,
          multiplier: clampNumber(parsed.item?.multiplier, 1, 10000, d.item.multiplier),
          maxItems: clampNumber(parsed.item?.maxItems, 0, 1e9, d.item.maxItems),
          dropEnabled: parsed.item?.dropEnabled === true,
          dropMultiplier: clampNumber(parsed.item?.dropMultiplier, 1, 10000, d.item.dropMultiplier),
          guaranteedDrop: parsed.item?.guaranteedDrop !== false,
          giveAmount: clampNumber(parsed.item?.giveAmount, 1, 1e9, d.item.giveAmount),
        },
        generic: {
          enabled: parsed.generic?.enabled === true,
          script: typeof parsed.generic?.script === "string" ? parsed.generic.script : "",
        },
      };
      Object.assign(this.settings, next);
    } catch {
      this.logger.warn("[Cheat] 恢复修改器配置失败，使用默认值");
    }
  }

  reset(): void {
    Object.assign(this.settings, deepClone(DEFAULT_CHEAT_SETTINGS));
    this.saveToStorage();
    this.logger.info("[Cheat] 修改器配置已重置");
  }

  // ==================== 状态 ====================

  getStats(): CheatStats {
    const engine = this.currentEngine();
    return {
      enabled: this.settings.enabled,
      applied: this.appliedEngine !== null,
      engine: this.appliedEngine || this.currentEngineKey(),
      engineName: engine?.name || "未知引擎",
      patched: this.patched.length > 0 ? [...this.patched] : this.registry.list(),
      supported: engine ? engine.capabilities.length > 0 || engine.key === "generic" : false,
    };
  }

  dispose(): void {
    this.saveDebounced?.flush();
    this.revert();
  }
}
