/**
 * generic.ts — 自定义脚本适配器（通用兜底）
 *
 * 适用场景：非 RPG Maker 引擎（PixiJS / Cocos2d / Phaser / 原生 Canvas 等），
 * 或 RPG Maker 里需要注入本面板未覆盖的自定义补丁。
 *
 * 机制：
 *   1. 执行前用正则扫描脚本里的 `Xxx.prototype.yyy =` 赋值，备份被覆盖的原始方法
 *   2. 以 new Function 执行用户脚本（可访问全部全局对象与 settings）
 *   3. revert() 时把备份的原始方法写回
 *
 * 限制：无法备份的副作用（如直接改 $data 数据、注册事件监听）需刷新页面才能彻底还原。
 */

import logger, { LogLevel } from "../../logger";
import config from "../../../config";

/** 匹配 `Game_Party.prototype.gainGold =` 这类赋值 */
const ASSIGN_RE =
  /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.prototype\.([A-Za-z_$][\w$]*)\s*=/g;

type BackupRecord = {
  key: string;
  proto: any;
  method: string;
  original: any;
};

const backups = new Map<string, BackupRecord>();

function resolveGlobal(path: string): any {
  if (!path) return undefined;
  return path
    .split(".")
    .reduce<any>(
      (acc, key) => (acc === null || acc === undefined ? undefined : acc[key]),
      window as any
    );
}

/** 备份脚本中所有会被覆盖的原型方法 */
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
    backups.set(key, { key, proto: cls.prototype, method, original });
    count++;
  }
  return count;
}

export const genericAdapter: Options.CheatEngineAdapter = {
  key: "generic",
  name: "自定义脚本注入",
  desc: "执行自定义 JS 补丁，适用于任意引擎",
  capabilities: [],

  detect(): boolean {
    return true;
  },

  apply(settings: Options.CheatSettings): string[] {
    const script = (settings.generic?.script || "").trim();
    if (!settings.generic?.enabled || !script) return [];

    const backed = backupFromScript(script);

    try {
      // settings 作为参数传入，脚本里可直接读取倍率等配置
      const fn = new Function(
        "settings",
        "console",
        `"use strict";\n${script}\n`
      );
      fn(settings, console);
      logger.addLog(
        `[Cheat] 自定义脚本已执行（备份 ${backed} 个原型方法）`,
        LogLevel.SUCCESS
      );
      if (config.debug) {
        console.log("[MToolTranslatorPlugin][Cheat] 自定义脚本执行完成");
      }
      return [`自定义脚本（备份 ${backed} 个原型方法）`];
    } catch (e: any) {
      logger.addLog(`[Cheat] 自定义脚本执行失败: ${e.message}`, LogLevel.ERROR);
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
      logger.addLog(
        `[Cheat] 自定义脚本已还原 ${count} 个原型方法（其余副作用需刷新页面）`,
        LogLevel.INFO
      );
    }
  },
};

/** 预设脚本模板：RPG Maker 经典倍率补丁（可直接改造成自己的补丁） */
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
        if (container[item.id] === 0) {
            delete container[item.id];
        }
        if (includeEquip && newNumber < 0) {
            this.discardMembersEquip(item, -newNumber);
        }
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
    var value = this.currentClass().params[paramId][this._level];
    value *= (settings.actor.paramBaseMultiplier || 2);
    return value;
};

Game_Actor.prototype.paramPlus = function(paramId) {
    var value = Game_Battler.prototype.paramPlus.call(this, paramId);
    var equips = this.equips();
    for (var i = 0; i < equips.length; i++) {
        var item = equips[i];
        if (item) { value += item.params[paramId]; }
    }
    value *= (settings.actor.paramPlusMultiplier || 2);
    return value;
};

Game_BattlerBase.prototype.paramMax = function(paramId) {
    return settings.actor.paramMaxEnabled ? settings.actor.paramMax : 999999;
};
`;
