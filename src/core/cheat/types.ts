/**
 * cheat/types.ts — 修改器领域类型
 */

import type { PrototypeHookRegistry } from "../hooks/hook-registry";

export type CheatCapability = "gold" | "actor" | "item" | "drop";
export type CheatEngineKey = "auto" | "rpgmaker" | "generic";

export interface CheatEngineAdapter {
  key: string;
  name: string;
  desc: string;
  capabilities: CheatCapability[];
  detect(): boolean;
  apply(settings: Options.CheatSettings, registry: PrototypeHookRegistry): string[];
  revert(registry: PrototypeHookRegistry): void;
}

export interface CheatEngineInfo {
  key: string;
  name: string;
  desc: string;
  capabilities: CheatCapability[];
  available: boolean;
}

export interface CheatStats {
  enabled: boolean;
  applied: boolean;
  engine: string;
  engineName: string;
  patched: string[];
  supported: boolean;
}
