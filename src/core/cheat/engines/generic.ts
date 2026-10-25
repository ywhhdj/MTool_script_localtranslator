/**
 * cheat/engines/generic.ts — 自定义脚本适配器
 *
 * 备份被覆盖的原型方法 → new Function 执行 → revert 时写回。
 * 备份记录与适配器解耦（多次 apply 不会丢失早期备份）。
 */

import type { CheatEngineAdapter } from "../types";
import { resolveGlobal } from "../../platform/env";

const ASSIGN_RE =
  /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.prototype\.([A-Za-z_$][\w$]*)\s*=/g;

type BackupRecord = { proto: any; method: string; original: any };

const backups = new Map<string, BackupRecord>();

function backupFromScript(script: string): number {
  let count = 0;
  let m: RegExpExecArray | null;
  ASSIGN_RE.lastIndex = 0;
  while ((m = ASSIGN_RE.exec(script)) !== null) {
    const clsPath = m[1];
    const method = m[2];
    const cls = resolveGlobal(clsPath);
    if (!cls || !cls.prototype) continue;
    const original = cls.prototype[method];
    if (typeof original !== "function") continue;
    const key = `${clsPath}.prototype.${method}`;
    if (backups.has(key)) continue;
    backups.set(key, { proto: cls.prototype, method, original });
    count++;
  }
  return count;
}

export const genericAdapter: CheatEngineAdapter = {
  key: "generic",
  name: "自定义脚本注入",
  desc: "执行自定义 JS 补丁，适用于任意引擎",
  capabilities: [],

  detect(): boolean {
    return true;
  },

  apply(settings): string[] {
    const script = (settings.generic?.script || "").trim();
    if (!settings.generic?.enabled || !script) return [];
    const backed = backupFromScript(script);
    try {
      const fn = new Function("settings", "console", `"use strict";\n${script}\n`);
      fn(settings, console);
      return [`自定义脚本（备份 ${backed} 个原型方法）`];
    } catch (e: any) {
      console.warn("[MToolTranslatorPlugin][Cheat] 自定义脚本执行失败:", e);
      return [];
    }
  },

  revert(): void {
    let count = 0;
    for (const record of Array.from(backups.values())) {
      try {
        record.proto[record.method] = record.original;
        count++;
      } catch {
        /* 忽略单个还原失败 */
      }
    }
    backups.clear();
    if (count > 0) {
      console.log(
        `[MToolTranslatorPlugin][Cheat] 自定义脚本已还原 ${count} 个原型方法（其余副作用需刷新页面）`
      );
    }
  },
};

/** 预设脚本模板（面板「载入示例」用） */
export const GENERIC_SCRIPT_PRESET = `// 自定义补丁示例：RPG Maker MV/MZ 倍率修改
// 可直接访问 window 上的全局对象（Game_Party、Game_Actor ...）
// 变量 settings 为面板上的当前配置

Game_Party.prototype.gainItem = function(item, amount, includeEquip) {
  var container = this.itemContainer(item);
  if (container) {
    if (amount >= 1) { amount *= settings.item.multiplier || 5; }
    var lastNumber = this.numItems(item);
    var newNumber = lastNumber + amount;
    container[item.id] = newNumber.clamp(0, 99999);
    if (container[item.id] === 0) { delete container[item.id]; }
    if (includeEquip && newNumber < 0) { this.discardMembersEquip(item, -newNumber); }
    $gameMap.requestRefresh();
  }
};

Game_Party.prototype.gainGold = function(amount) {
  if (amount >= 1) { amount *= settings.gold.multiplier || 10; }
  this._gold = (this._gold + amount).clamp(0, 9999999999);
};

Game_Enemy.prototype.dropItemRate = function() {
  return $gameParty.hasDropItemDouble() ? 200 : 100;
};

Game_Actor.prototype.gainExp = function(exp) {
  var newExp = this.currentExp() + Math.round(exp * this.finalExpRate() * (settings.actor.expMultiplier || 2));
  this.changeExp(newExp, this.shouldDisplayLevelUp());
};

Game_Actor.prototype.paramBase = function(paramId) {
  return this.currentClass().params[paramId][this._level] * (settings.actor.paramBaseMultiplier || 2);
};

Game_BattlerBase.prototype.paramMax = function(paramId) {
  return settings.actor.paramMaxEnabled ? settings.actor.paramMax : 999999;
};
`;
