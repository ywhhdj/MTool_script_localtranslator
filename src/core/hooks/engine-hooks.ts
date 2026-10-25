/**
 * hooks/engine-hooks.ts — 渲染层文本 Hook
 *
 * 支持 RPG Maker / Bitmap / Canvas2D / PixiJS / Cocos2d / Phaser。
 * 每个引擎只负责「把绘制入口的文本换掉」，不含任何翻译逻辑（依赖注入 callback）。
 */

import type { Disposable, Disposer } from "../domain/disposable";
import { PrototypeHookRegistry } from "./hook-registry";
import { resolveGlobal } from "../platform/env";

export type TextHook = (text: string) => string;

/** 文本参数总是第 0 个的绘制方法 */
const TEXT_FIRST_ARG_TARGETS: Array<{
  engine: string;
  path: string;
  methods: string[];
}> = [
  { engine: "bitmap", path: "Bitmap", methods: ["drawText", "drawTextEx"] },
  {
    engine: "canvas2d",
    path: "CanvasRenderingContext2D",
    methods: ["fillText", "strokeText"],
  },
  {
    engine: "rpgmaker",
    path: "Window_Base",
    methods: ["drawText", "drawTextEx", "convertEscapeCharacters"],
  },
  { engine: "cocos2d", path: "cc.Label", methods: ["setString"] },
  { engine: "phaser", path: "Phaser.GameObjects.Text", methods: ["setText"] },
];

export interface EngineHookResult extends Disposable {
  applied: string[];
}

export class EngineHooks implements Disposable {
  private registry = new PrototypeHookRegistry();
  private applied: string[] = [];

  get appliedList(): string[] {
    return this.applied.slice();
  }

  /** 按开关安装（同名方法只装一次） */
  install(translate: TextHook, enabled: Record<string, boolean>): string[] {
    this.applied = [];
    for (const target of TEXT_FIRST_ARG_TARGETS) {
      if (enabled[target.engine] === false) continue;
      for (const method of target.methods) {
        if (!PrototypeHookRegistry.exists(target.path, method)) continue;
        const ok = this.registry.hook(target.path, method, (original, _self, args) => {
          if (typeof args[0] !== "string" || args[0].length === 0) {
            return original(...args);
          }
          args[0] = translate(args[0]);
          return original(...args);
        });
        if (ok) this.applied.push(`${target.path}.${method}`);
      }
    }
    // PixiJS / RPG Maker 的额外入口
    this.installPixi(translate, enabled);
    this.installRpgInterpreter(translate, enabled);
    return this.appliedList;
  }

  private installPixi(translate: TextHook, enabled: Record<string, boolean>): void {
    if (enabled["pixijs"] === false) return;
    const pixi = resolveGlobal("PIXI");
    if (!pixi) return;
    const cls = pixi.Text || pixi.BitmapText;
    if (!cls || !cls.prototype) return;
    const path = pixi.Text ? "PIXI.Text" : "PIXI.BitmapText";
    const method = ["updateText", "_updateText", "setText"].find(
      (m) => typeof cls.prototype[m] === "function"
    );
    if (!method) return;
    const ok = this.registry.hook(path, method, (original, _self, args) => {
      if (typeof args[0] === "string" && args[0].length > 0) args[0] = translate(args[0]);
      return original(...args);
    });
    if (ok) this.applied.push(`${path}.${method}`);
  }

  private installRpgInterpreter(translate: TextHook, enabled: Record<string, boolean>): void {
    if (enabled["rpgmaker"] === false) return;
    if (!PrototypeHookRegistry.exists("Game_Interpreter", "command101")) return;
    const ok = this.registry.hook("Game_Interpreter", "command101", (original, self, args) => {
      try {
        const params = (self as any)?._params;
        if (params && typeof params[0] === "string") {
          const next = translate(params[0]);
          if (typeof next === "string") params[0] = next;
        }
      } catch {
        /* 单个事件指令失败不影响游戏 */
      }
      return original(...args);
    });
    if (ok) this.applied.push("Game_Interpreter.command101");
  }

  dispose(): void {
    this.registry.dispose();
    this.applied = [];
  }
}

/**
 * RPG Maker 数据加载时的「预翻译」入口。
 * 原地改写 $data 里的字符串（不深拷贝），并保持对象引用不变。
 */
export function installPreTranslateHook(
  translate: TextHook,
  registry: PrototypeHookRegistry
): Disposer {
  if (!PrototypeHookRegistry.exists("DataManager", "onLoad")) return () => {};
  const ok = registry.hook("DataManager", "onLoad", (original, _self, args) => {
    const object = args[0];
    if (object && typeof object === "object") {
      deepTranslateInPlace(object, translate);
    }
    return original(...args);
  });
  if (!ok) return () => {};
  return () => registry.unhook("DataManager", "onLoad");
}

const NUMERIC_OR_EMPTY = /^[\d０-９\s\-+\.\/]+$/;
const MAX_DEEP_DEPTH = 12;

function isTranslatableString(s: string): boolean {
  return (
    s.length >= 2 &&
    !NUMERIC_OR_EMPTY.test(s) &&
    !s.startsWith("\x1b") &&
    !s.startsWith("\u001b")
  );
}

export function deepTranslateInPlace(
  obj: any,
  translate: (s: string) => string,
  seen: WeakSet<object> = new WeakSet(),
  depth: number = 0
): any {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  if (depth > MAX_DEEP_DEPTH) return obj;
  if (seen.has(obj)) return obj; // 循环引用保护
  seen.add(obj);

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i];
      if (typeof item === "string") {
        if (isTranslatableString(item)) {
          const t = translate(item);
          if (t) obj[i] = t;
        }
      } else if (item !== null && typeof item === "object") {
        deepTranslateInPlace(item, translate, seen, depth + 1);
      }
    }
    return obj;
  }

  for (const key of Object.keys(obj)) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const val = obj[key];
    if (typeof val === "string") {
      if (isTranslatableString(val)) {
        const t = translate(val);
        if (t) obj[key] = t;
      }
    } else if (val !== null && typeof val === "object") {
      deepTranslateInPlace(val, translate, seen, depth + 1);
    }
  }
  return obj;
}

/** 扫描 RPG Maker $data 中的日文文本（用于预翻译素材收集） */
export function collectTexts(
  obj: any,
  set: Set<string>,
  seen: WeakSet<object> = new WeakSet(),
  depth: number = 0
): void {
  const JP_TEXT_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
  if (obj === null || obj === undefined) return;
  if (typeof obj === "string") {
    if (obj.trim() && obj.length >= 2 && JP_TEXT_RE.test(obj)) set.add(obj.trim());
    return;
  }
  if (typeof obj !== "object" || depth > MAX_DEEP_DEPTH) return;
  if (seen.has(obj)) return;
  seen.add(obj);
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) collectTexts(obj[i], set, seen, depth + 1);
    return;
  }
  for (const key of Object.keys(obj)) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      collectTexts(obj[key], set, seen, depth + 1);
    }
  }
}
