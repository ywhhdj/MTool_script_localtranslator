/**
 * rpgmaker.ts — RPG Maker MV / MZ 数值修改适配器
 *
 * 注入点（对照原型实现）：
 *   金额: Game_Party.gainGold(amount) / Game_Party.maxGold()
 *   物品: Game_Party.gainItem(item, amount, includeEquip) / Game_Party.maxNumItems(item)
 *   角色: Game_Actor.gainExp(exp) / paramBase(paramId) / paramPlus(paramId) / maxLevel()
 *         Game_BattlerBase.paramMax(paramId) + Game_Actor.paramMax(paramId)
 *   掉落: Game_Enemy.dropItemRate()
 *
 * 重要：所有倍率都在补丁内部「实时读取」settings，因此界面上改滑块立即生效，无需重新注入。
 */

import { patchMethod, unpatchMethod, hasMethod } from "../patch";
import config from "../../../config";
import logger, { LogLevel } from "../../logger";

/** 本适配器可能注入的全部方法，用于 revert 时无遗漏还原 */
const ALL_PATCHES: Array<[string, string]> = [
  ["Game_Party", "gainGold"],
  ["Game_Party", "maxGold"],
  ["Game_Party", "gainItem"],
  ["Game_Party", "maxNumItems"],
  ["Game_Actor", "gainExp"],
  ["Game_Actor", "paramBase"],
  ["Game_Actor", "paramPlus"],
  ["Game_Actor", "paramMax"],
  ["Game_BattlerBase", "paramMax"],
  ["Game_Actor", "maxLevel"],
  ["Game_Enemy", "dropItemRate"],
];

/** 安全取数：NaN / undefined 一律回落原值 */
function num(v: any, fallback: number = 1): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const rpgMakerAdapter: Options.CheatEngineAdapter = {
  key: "rpgmaker",
  name: "RPG Maker MV/MZ",
  desc: "Game_Party / Game_Actor 原型注入",
  capabilities: ["gold", "actor", "item", "drop"],

  detect(): boolean {
    const w = window as any;
    // 类定义存在（MV/MZ 把核心类挂在 window 上），或运行时实例已创建
    return Boolean(
      (w.Game_Party && w.Game_Actor) || (w.$gameParty && w.$gameActors)
    );
  },

  apply(settings: Options.CheatSettings): string[] {
    const applied: string[] = [];
    const mark = (path: string, method: string, ok: boolean) => {
      if (ok) applied.push(`${path}.${method}`);
    };

    // ==================== 💰 金额 ====================
    if (settings.gold.enabled) {
      mark(
        "Game_Party",
        "gainGold",
        patchMethod("Game_Party", "gainGold", (original, _self, args) => {
          let amount = num(args[0], 0);
          // 只在「获得」时放大，支出/扣款保持原样，否则买东西也会翻 N 倍
          if (amount > 0) {
            amount = amount * num(settings.gold.multiplier, 1);
            const minGain = num(settings.gold.minGain, 0);
            if (minGain > 0) amount = Math.max(amount, minGain);
            args[0] = Math.round(amount);
          }
          return original(...args);
        })
      );

      // 金币上限：MZ 有 maxGold()，MV 没有 → 不存在时静默跳过
      if (num(settings.gold.maxGold, 0) > 0) {
        mark(
          "Game_Party",
          "maxGold",
          patchMethod("Game_Party", "maxGold", () =>
            Math.round(num(settings.gold.maxGold, 9999999999))
          )
        );
      }
    }

    // ==================== 🎒 物品获取量 ====================
    if (settings.item.enabled) {
      mark(
        "Game_Party",
        "gainItem",
        patchMethod("Game_Party", "gainItem", (original, _self, args) => {
          let amount = num(args[1], 0);
          if (amount > 0) {
            amount = amount * num(settings.item.multiplier, 1);
            args[1] = Math.round(amount);
          }
          return original(...args);
        })
      );

      // 单格持有上限（MV/MZ 默认 99）
      if (num(settings.item.maxItems, 0) > 0) {
        mark(
          "Game_Party",
          "maxNumItems",
          patchMethod("Game_Party", "maxNumItems", () =>
            Math.round(num(settings.item.maxItems, 99))
          )
        );
      }
    }

    // ==================== 掉落率 ====================
    if (settings.item.dropEnabled) {
      mark(
        "Game_Enemy",
        "dropItemRate",
        patchMethod("Game_Enemy", "dropItemRate", (original, _self, args) => {
          const base = num(original(...args), 0);
          if (settings.item.guaranteedDrop) return 1e9;
          const m = num(settings.item.dropMultiplier, 1);
          // 兼容两种实现：原生返回 1/2（倍率），部分插件返回 100/200（百分比）
          return base >= 100 ? Math.round(base * m) : base * m;
        })
      );
    }

    // ==================== 🧑 角色属性·等级 ====================
    if (settings.actor.expEnabled) {
      mark(
        "Game_Actor",
        "gainExp",
        patchMethod("Game_Actor", "gainExp", (original, _self, args) => {
          let exp = num(args[0], 0);
          if (exp > 0) {
            args[0] = Math.round(exp * num(settings.actor.expMultiplier, 1));
          }
          return original(...args);
        })
      );
    }

    if (settings.actor.paramEnabled) {
      mark(
        "Game_Actor",
        "paramBase",
        patchMethod("Game_Actor", "paramBase", (original, _self, args) => {
          const value = num(original(...args), 0);
          return Math.round(value * num(settings.actor.paramBaseMultiplier, 1));
        })
      );

      mark(
        "Game_Actor",
        "paramPlus",
        patchMethod("Game_Actor", "paramPlus", (original, _self, args) => {
          const value = num(original(...args), 0);
          return Math.round(value * num(settings.actor.paramPlusMultiplier, 1));
        })
      );
    }

    if (settings.actor.paramMaxEnabled) {
      const max = Math.round(num(settings.actor.paramMax, 999999));
      // 父类与子类都可能存在（Game_Actor 覆盖 Game_BattlerBase），两处都注入
      mark(
        "Game_BattlerBase",
        "paramMax",
        patchMethod("Game_BattlerBase", "paramMax", () => max)
      );
      mark(
        "Game_Actor",
        "paramMax",
        patchMethod("Game_Actor", "paramMax", () => max)
      );
    }

    if (settings.actor.levelMaxEnabled) {
      mark(
        "Game_Actor",
        "maxLevel",
        patchMethod("Game_Actor", "maxLevel", () =>
          Math.round(num(settings.actor.levelMax, 99))
        )
      );
    }

    if (config.debug) {
      console.log(
        `[MToolTranslatorPlugin][Cheat] RPG Maker 注入完成: ${
          applied.join(", ") || "无"
        }`
      );
    }
    return applied;
  },

  revert(): void {
    let count = 0;
    for (const [path, method] of ALL_PATCHES) {
      if (unpatchMethod(path, method)) count++;
    }
    if (count > 0) {
      logger.addLog(
        `[Cheat] RPG Maker 已还原 ${count} 个注入点`,
        LogLevel.INFO
      );
    }
  },

  /** 扩展：是否存在指定注入点（供 UI 提示兼容性） */
  // @ts-ignore 适配器接口的补充方法
  supports(path: string, method: string): boolean {
    return hasMethod(path, method);
  },
};
