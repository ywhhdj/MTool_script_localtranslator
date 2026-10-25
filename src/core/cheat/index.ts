/**
 * index.ts — CheatManager 修改器管理器
 *
 * 职责：
 *   1. 维护修改器配置（reactive，UI 双向绑定）
 *   2. 按引擎 chose 适配器并注入 / 还原补丁
 *   3. 配置持久化（localStorage，独立于翻译配置）
 *   4. 提供无需注入的快捷动作（直接设定金币 / 一键满级 / 全道具发放 / 全队回满）
 *
 * 关键设计：补丁内部实时读取 settings，因此改倍率即时生效，无需重新 apply。
 */

import { reactive } from "vue";
import logger, { LogLevel } from "../logger";
import config from "../../config";
import {
  getAdapter,
  resolveEngineKey,
  listEngines,
  detectedRenderEngines,
} from "./engines";
import { unpatchAll, patchedList } from "./patch";

const STORAGE_KEY = "MToolCheatSettings";

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
  generic: {
    enabled: false,
    script: "",
  },
};

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

class CheatManager {
  public settings = reactive<Options.CheatSettings>(
    deepClone(DEFAULT_CHEAT_SETTINGS)
  );

  private appliedEngine: string | null = null;
  private patched: string[] = [];

  constructor() {
    this.loadFromStorage();
  }

  // ==================== 引擎 ====================

  /** 引擎列表（含可用性） */
  engines(): Options.CheatEngineInfo[] {
    return listEngines();
  }

  /** 解析当前生效的引擎 key（auto 走自动检测） */
  currentEngineKey(): string {
    return resolveEngineKey(this.settings.engine as Options.CheatEngineKey);
  }

  currentEngine(): Options.CheatEngineInfo | null {
    const key = this.currentEngineKey();
    return this.engines().find((e) => e.key === key) || null;
  }

  /** 当前引擎是否支持某个域 */
  supports(cap: Options.CheatCapability): boolean {
    const engine = this.currentEngine();
    if (!engine) return false;
    // 自定义脚本不声明能力，交由用户脚本决定 → 视为支持，避免 UI 全灰
    if (engine.key === "generic") return true;
    return engine.capabilities.includes(cap);
  }

  /** 页面上存在但无法做数值注入的渲染引擎（用于提示） */
  renderOnlyEngines(): string[] {
    return detectedRenderEngines();
  }

  // ==================== 应用 / 还原 ====================

  /** 应用修改：先还原旧引擎补丁，再按当前引擎注入 */
  apply(): Options.CheatStats {
    this.revert();

    const key = this.currentEngineKey();
    const adapter = getAdapter(key);
    if (!adapter) {
      logger.addLog(`[Cheat] 未找到引擎适配器: ${key}`, LogLevel.ERROR);
      return this.getStats();
    }

    if (!adapter.detect() && key !== "generic") {
      logger.addLog(
        `[Cheat] ${adapter.name} 未检测到，未注入（可切换为自定义脚本）`,
        LogLevel.WARNING
      );
      this.settings.enabled = false;
      return this.getStats();
    }

    this.patched = adapter.apply(this.settings);
    this.appliedEngine = key;
    this.settings.enabled = true;
    this.saveToStorage();

    logger.addLog(
      `[Cheat] 已应用 [${adapter.name}]：${this.patched.length} 个注入点`,
      LogLevel.SUCCESS
    );
    return this.getStats();
  }

  /** 还原全部补丁 */
  revert(): number {
    const adapter = this.appliedEngine ? getAdapter(this.appliedEngine) : null;
    if (adapter) adapter.revert();
    // 兜底：清掉所有遗漏的补丁
    const rest = unpatchAll();
    this.appliedEngine = null;
    this.patched = [];
    if (rest > 0 || adapter) {
      logger.addLog(`[Cheat] 修改器已还原`, LogLevel.INFO);
    }
    return rest;
  }

  /** 总开关切换 */
  toggle(enabled?: boolean): Options.CheatStats {
    const next = enabled === undefined ? !this.settings.enabled : enabled;
    if (next) return this.apply();
    this.revert();
    this.settings.enabled = false;
    this.saveToStorage();
    return this.getStats();
  }

  /** 引擎切换：改动后自动重新应用（若已启用） */
  setEngine(engine: Options.CheatEngineKey): Options.CheatStats {
    this.settings.engine = engine;
    this.saveToStorage();
    if (this.settings.enabled) return this.apply();
    return this.getStats();
  }

  // ==================== 快捷动作（无需注入，直接操作运行时对象）====================

  private party(): any {
    return (window as any).$gameParty || null;
  }

  /** 直接设定金币数量 */
  setGold(value: number): boolean {
    const party = this.party();
    if (!party) {
      logger.addLog(
        "[Cheat] $gameParty 不存在，无法设定金币",
        LogLevel.WARNING
      );
      return false;
    }
    const v = Math.max(0, Math.round(Number(value) || 0));
    party._gold = v;
    if (typeof party.requestRefresh === "function") {
      try {
        (window as any).$gameMap?.requestRefresh?.();
      } catch {
        /* 地图未就绪时忽略 */
      }
    }
    logger.addLog(`[Cheat] 金币已设为 ${v}`, LogLevel.SUCCESS);
    return true;
  }

  /** 全队满级 */
  maxLevel(): boolean {
    const party = this.party();
    if (!party || typeof party.members !== "function") {
      logger.addLog("[Cheat] $gameParty 不存在，无法满级", LogLevel.WARNING);
      return false;
    }
    const level = Math.round(Number(this.settings.actor.levelMax) || 99);
    let count = 0;
    for (const actor of party.members()) {
      try {
        if (typeof actor.changeLevel === "function") {
          actor.changeLevel(level, false);
        } else {
          actor._level = level;
        }
        if (typeof actor.recoverAll === "function") actor.recoverAll();
        count++;
      } catch {
        /* 单个角色失败不影响其他角色 */
      }
    }
    logger.addLog(`[Cheat] ${count} 名角色已设为 Lv${level}`, LogLevel.SUCCESS);
    return count > 0;
  }

  /** 全道具 / 武器 / 护甲发放 */
  giveAllItems(amount?: number): boolean {
    const w = window as any;
    const party = this.party();
    if (!party || typeof party.gainItem !== "function") {
      logger.addLog(
        "[Cheat] $gameParty 不存在，无法发放物品",
        LogLevel.WARNING
      );
      return false;
    }
    const n = Math.max(
      1,
      Math.round(amount ?? (Number(this.settings.item.giveAmount) || 99))
    );
    let count = 0;
    for (const list of [w.$dataItems, w.$dataWeapons, w.$dataArmors]) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!item || item.name === undefined) continue;
        try {
          party.gainItem(item, n, false);
          count++;
        } catch (e: any) {
          if (config.debug) {
            console.warn(
              "[MToolTranslatorPlugin][Cheat] 发放失败:",
              item?.name,
              e
            );
          }
        }
      }
    }
    logger.addLog(`[Cheat] 已发放 ${count} 种道具 ×${n}`, LogLevel.SUCCESS);
    return count > 0;
  }

  /** 全队 HP/MP 回满 */
  recoverAll(): boolean {
    const party = this.party();
    if (!party || typeof party.members !== "function") {
      logger.addLog("[Cheat] $gameParty 不存在，无法回满", LogLevel.WARNING);
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
    logger.addLog(`[Cheat] ${count} 名角色已回满`, LogLevel.SUCCESS);
    return count > 0;
  }

  // ==================== 持久化 ====================

  saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      logger.addLog("[Cheat] 保存修改器配置失败", LogLevel.WARNING);
    }
  }

  loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      // 逐域合并，兼容旧版本缺字段
      const next: Options.CheatSettings = {
        ...deepClone(DEFAULT_CHEAT_SETTINGS),
        ...parsed,
        gold: { ...DEFAULT_CHEAT_SETTINGS.gold, ...(parsed.gold || {}) },
        actor: { ...DEFAULT_CHEAT_SETTINGS.actor, ...(parsed.actor || {}) },
        item: { ...DEFAULT_CHEAT_SETTINGS.item, ...(parsed.item || {}) },
        generic: {
          ...DEFAULT_CHEAT_SETTINGS.generic,
          ...(parsed.generic || {}),
        },
      };
      // reactive 对象逐字段赋值，保持代理
      Object.assign(this.settings, next);
    } catch (e) {
      logger.addLog("[Cheat] 恢复修改器配置失败，使用默认值", LogLevel.WARNING);
    }
  }

  reset(): void {
    Object.assign(this.settings, deepClone(DEFAULT_CHEAT_SETTINGS));
    this.saveToStorage();
    logger.addLog("[Cheat] 修改器配置已重置", LogLevel.INFO);
  }

  // ==================== 状态 ====================

  getStats(): Options.CheatStats {
    const engine = this.currentEngine();
    return {
      enabled: this.settings.enabled,
      applied: this.appliedEngine !== null,
      engine: this.appliedEngine || this.currentEngineKey(),
      engineName: engine?.name || "未知引擎",
      // 优先显示本次 apply 记录的清单（自定义脚本的赋值不经过 patch.ts，无法枚举）
      patched: this.patched.length > 0 ? [...this.patched] : patchedList(),
      supported: engine
        ? engine.capabilities.length > 0 || engine.key === "generic"
        : false,
    };
  }

  /** 当前游戏是否具备某引擎的运行时对象（UI 提示用） */
  hasRuntime(): boolean {
    const w = window as any;
    return Boolean(w.$gameParty || w.$gameActors);
  }
}

const cheat = new CheatManager();
export default cheat;
