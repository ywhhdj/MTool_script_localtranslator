/**
 * engines/index.ts — 修改器引擎注册表
 *
 * 「翻译引擎」(EngineType) 管的是文本渲染链路，「修改器引擎」管的是数值注入链路，
 * 二者互相独立：PixiJS / Cocos2d / Phaser 等只有渲染层，没有通用数值接口，
 * 因此这里只对真正可注入的引擎提供适配器，其余一律降级到自定义脚本。
 */

import { rpgMakerAdapter } from "./rpgmaker";
import { genericAdapter } from "./generic";

/** 可注入的引擎（generic 作为兜底，不参与自动检测） */
export const ENGINE_ADAPTERS: Options.CheatEngineAdapter[] = [
  rpgMakerAdapter,
  genericAdapter,
];

/** 仅渲染层的引擎：用于面板提示「当前引擎无通用数值接口」 */
const RENDER_ONLY_ENGINES: Array<{
  name: string;
  detect: () => boolean
}> = [
  { name: "PixiJS", detect: () => Boolean((window as any).PIXI) },
  { name: "Cocos2d-js", detect: () => Boolean((window as any).cc) },
  { name: "Phaser", detect: () => Boolean((window as any).Phaser) },
  {
    name: "Canvas 2D",
    detect: () =>
      typeof (window as any).CanvasRenderingContext2D !== "undefined",
  },
  { name: "Bitmap", detect: () => Boolean((window as any).Bitmap) },
];

export function getAdapter(key: string): Options.CheatEngineAdapter | null {
  return ENGINE_ADAPTERS.find((a) => a.key === key) || null;
}

/** 自动检测：rpgmaker 优先，否则回落 generic */
export function resolveEngineKey(engine: Options.CheatEngineKey): string {
  if (engine && engine !== "auto") return engine;
  const hit = ENGINE_ADAPTERS.find((a) => a.key !== "generic" && a.detect());
  return hit ? hit.key : "generic";
}

/** 引擎列表（含可用性），供 UI 展示 */
export function listEngines(): Options.CheatEngineInfo[] {
  return ENGINE_ADAPTERS.map((a) => ({
    key: a.key,
    name: a.name,
    desc: a.desc,
    capabilities: a.capabilities,
    available: a.detect(),
  }));
}

/** 页面上检测到、但无法做数值注入的渲染引擎名 */
export function detectedRenderEngines(): string[] {
  return RENDER_ONLY_ENGINES.filter((e) => e.detect()).map((e) => e.name);
}
