/**
 * cheat/engines/index.ts — 修改器引擎注册表
 *
 * 只有真正可注入数值的引擎才提供适配器，其余一律降级到自定义脚本。
 */

import { rpgMakerAdapter } from "./rpgmaker";
import { genericAdapter } from "./generic";
import type { CheatEngineAdapter, CheatEngineKey, CheatEngineInfo } from "../types";

export const ENGINE_ADAPTERS: CheatEngineAdapter[] = [rpgMakerAdapter, genericAdapter];

const RENDER_ONLY_ENGINES: Array<{ name: string; detect: () => boolean }> = [
  { name: "PixiJS", detect: () => Boolean((window as any).PIXI) },
  { name: "Cocos2d-js", detect: () => Boolean((window as any).cc) },
  { name: "Phaser", detect: () => Boolean((window as any).Phaser) },
  {
    name: "Canvas 2D",
    detect: () => typeof (window as any).CanvasRenderingContext2D !== "undefined",
  },
  { name: "Bitmap", detect: () => Boolean((window as any).Bitmap) },
];

export function getAdapter(key: string): CheatEngineAdapter | null {
  return ENGINE_ADAPTERS.find((a) => a.key === key) || null;
}

export function resolveEngineKey(engine: CheatEngineKey): string {
  if (engine && engine !== "auto") return engine;
  const hit = ENGINE_ADAPTERS.find((a) => a.key !== "generic" && a.detect());
  return hit ? hit.key : "generic";
}

export function listEngines(): CheatEngineInfo[] {
  return ENGINE_ADAPTERS.map((a) => ({
    key: a.key,
    name: a.name,
    desc: a.desc,
    capabilities: a.capabilities,
    available: a.detect(),
  }));
}

export function detectedRenderEngines(): string[] {
  return RENDER_ONLY_ENGINES.filter((e) => e.detect()).map((e) => e.name);
}
