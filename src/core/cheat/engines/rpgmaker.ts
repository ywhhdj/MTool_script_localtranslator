/**
 * cheat/engines/rpgmaker.ts — RPG Maker MV/MZ 数值修改适配器
 *
 * 所有倍率都在补丁内部「实时读取」settings，改滑块即时生效，无需重新注入。
 *
 *   1. 「幂等 / 可完整还原 / 异常回落」由注册表统一保证；
 *   2. 由注册表的已注入清单决定。
 */

import type { CheatEngineAdapter } from "../types";

function num(v: any, fallback: number = 1): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const rpgMakerAdapter: CheatEngineAdapter = {
  key: "rpgmaker",
  name: "RPG Maker MV/MZ",
  desc: "Game_Party / Game_Actor 原型注入",
  capabilities: ["gold", "actor", "item", "drop"],

  detect(): boolean {
    const w = window as any;
    return Boolean((w.Game_Party && w.Game_Actor) || (w.$gameParty && w.$gameActors));
  },

  apply(settings, registry): string[] {
    const applied: string[] = [];
    const mark = (path: string, method: string, ok: boolean) => {
      if (ok) applied.push(`${path}.${method}`);
    };

    if (settings.gold.enabled) {
      mark(
        "Game_Party",
        "gainGold",
        registry.hook("Game_Party", "gainGold", (original, _self, args) => {
          let amount = num(args[0], 0);
          if (amount > 0) {
            amount *= num(settings.gold.multiplier, 1);
            const minGain = num(settings.gold.minGain, 0);
            if (minGain > 0) amount = Math.max(amount, minGain);
            args[0] = Math.round(amount);
          }
          return original(...args);
        })
      );
      if (num(settings.gold.maxGold, 0) > 0) {
        mark(
          "Game_Party",
          "maxGold",
          registry.hook("Game_Party", "maxGold", () =>
            Math.round(num(settings.gold.maxGold, 9999999999))
          )
        );
      }
    }

    if (settings.item.enabled) {
      mark(
        "Game_Party",
        "gainItem",
        registry.hook("Game_Party", "gainItem", (original, _self, args) => {
          let amount = num(args[1], 0);
          if (amount > 0) {
            amount *= num(settings.item.multiplier, 1);
            args[1] = Math.round(amount);
          }
          return original(...args);
        })
      );
      if (num(settings.item.maxItems, 0) > 0) {
        mark(
          "Game_Party",
          "maxNumItems",
          registry.hook("Game_Party", "maxNumItems", () =>
            Math.round(num(settings.item.maxItems, 99))
          )
        );
      }
    }

    if (settings.item.dropEnabled) {
      mark(
        "Game_Enemy",
        "dropItemRate",
        registry.hook("Game_Enemy", "dropItemRate", (original, _self, args) => {
          const base = num(original(...args), 0);
          if (settings.item.guaranteedDrop) return 1e9;
          const m = num(settings.item.dropMultiplier, 1);
          return base >= 100 ? Math.round(base * m) : base * m;
        })
      );
    }

    if (settings.actor.expEnabled) {
      mark(
        "Game_Actor",
        "gainExp",
        registry.hook("Game_Actor", "gainExp", (original, _self, args) => {
          let exp = num(args[0], 0);
          if (exp > 0) args[0] = Math.round(exp * num(settings.actor.expMultiplier, 1));
          return original(...args);
        })
      );
    }

    if (settings.actor.paramEnabled) {
      mark(
        "Game_Actor",
        "paramBase",
        registry.hook("Game_Actor", "paramBase", (original, _self, args) =>
          Math.round(num(original(...args), 0) * num(settings.actor.paramBaseMultiplier, 1))
        )
      );
      mark(
        "Game_Actor",
        "paramPlus",
        registry.hook("Game_Actor", "paramPlus", (original, _self, args) =>
          Math.round(num(original(...args), 0) * num(settings.actor.paramPlusMultiplier, 1))
        )
      );
    }

    if (settings.actor.paramMaxEnabled) {
      const max = Math.round(num(settings.actor.paramMax, 999999));
      mark("Game_BattlerBase", "paramMax", registry.hook("Game_BattlerBase", "paramMax", () => max));
      mark("Game_Actor", "paramMax", registry.hook("Game_Actor", "paramMax", () => max));
    }

    if (settings.actor.levelMaxEnabled) {
      mark(
        "Game_Actor",
        "maxLevel",
        registry.hook("Game_Actor", "maxLevel", () =>
          Math.round(num(settings.actor.levelMax, 99))
        )
      );
    }

    return applied;
  },

  revert(registry): void {
    // 只还原本适配器确实注入过的方法
    for (const key of registry.list()) {
      const prefix = key.split(".");
      const method = prefix.pop()!;
      const path = prefix.join(".");
      if (
        ["Game_Party", "Game_Actor", "Game_BattlerBase", "Game_Enemy"].some((p) =>
          path.startsWith(p)
        )
      ) {
        registry.unhook(path, method);
      }
    }
  },
};
