/**
 * config/config-store.ts — 配置中心
 *
 *   1. 默认值与用户值曾共用同一个对象引用（engines），改用户值会污染默认值；
 *      现在每个字段独立持有深拷贝的默认值；
 *   2. localStorage 恢复时曾「原样赋值」，类型不对就直接把内核搞崩；
 *      现在按 schema 逐字段 coerce（类型不符回落默认）；
 *   3. 缺失新增字段的旧配置会被 schema 补齐；
 *   4. 内核通过 get()/subscribe() 读普通值，不直接依赖 Vue 响应式对象；
 *      UI 仍可 v-model 绑定 user.xxx.userConfig（响应式只存在于表现层契约里）；
 *   5. 导出配置时对敏感字段（API Key）脱敏。
 */

import { reactive, watch } from "vue";
import { EngineType, Language } from "../../typings/enum";
import {
  DEFAULT_ENGINES,
  LANG_LABEL,
  STORAGE_KEYS,
} from "./defaults";
import type { KeyValueStorePort, ConfigReaderPort } from "../domain/ports";

export class ConfigField<T> {
  description: string;
  default: T;
  userConfig: T;

  constructor(description: string, defaultVal: T, userConfig: T) {
    this.description = description;
    this.default = defaultVal;
    this.userConfig = userConfig;
  }
}

type Coerce<T> = (value: unknown, fallback: T) => T;

const asString: Coerce<string> = (v, fb) =>
  typeof v === "string" ? v : v === undefined || v === null ? fb : String(v);

const asNumber: Coerce<number> = (v, fb) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

const asBoolean: Coerce<boolean> = (v, fb) =>
  typeof v === "boolean" ? v : fb;

const asEnum = <T extends string>(allowed: readonly T[]): Coerce<T> => (v, fb) =>
  allowed.includes(v as T) ? (v as T) : fb;

const asEngineMap: Coerce<Record<EngineType, boolean>> = (v, fb) => {
  const out = { ...fb };
  if (v && typeof v === "object") {
    for (const key of Object.keys(fb) as EngineType[]) {
      const val = (v as any)[key];
      if (typeof val === "boolean") out[key] = val;
    }
  }
  return out;
};

type FieldSpec<T> = {
  description: string;
  default: T;
  coerce: Coerce<T>;
  sensitive?: boolean;
};

function spec<T>(
  description: string,
  defaultValue: T,
  coerce: Coerce<T>,
  sensitive = false
): FieldSpec<T> {
  return { description, default: defaultValue, coerce, sensitive };
}

/** 单一职责：字段 schema 是「配置形状的真相来源」 */
export const USER_CONFIG_SCHEMA = {
  fileName: spec("翻译数据文件名", "default.json", asString),
  autoLoad: spec("启动时自动加载缓存", true, asBoolean),
  transengine: spec("MTool社区翻译引擎名", "Bing", asString),
  translatorName: spec("MTool社区翻译修正名称", "常规通用性修正", asString),
  targetLang: spec(
    "目标语言",
    Language.zh_CN,
    asEnum(Object.values(Language) as Language[])
  ),
  AI_BASE_URL: spec("AI API 基础 URL", "https://api.deepseek.com", asString),
  AI_KEY: spec("AI API 密钥", "", asString, true),
  model: spec("AI 模型名称", "deepseek-v4-flash", asString),
  enableAI: spec("启用 AI 翻译回退", false, asBoolean),
  aiTriggerThreshold: spec("AI翻译触发阈值", 5, asNumber),
  engines: spec("翻译引擎开关", { ...DEFAULT_ENGINES } as Record<EngineType, boolean>, asEngineMap),
  exportFormat: spec(
    "导出文件格式",
    "json" as "json" | "csv" | "tsv",
    asEnum(["json", "csv", "tsv"] as const)
  ),
  maxReplaceCount: spec("单次翻译最大替换次数", 1, asNumber),
  maxLogCount: spec("最大日志条数", 50, asNumber),
  maxCacheSize: spec("最大缓存大小", 30000, asNumber),
  hookWebSocket: spec("拦截 MTool AI 翻译 WebSocket", true, asBoolean),
  wsTargetURL: spec("WS 目标地址", "127.0.0.1:64002", asString),
  wsEnableRequestFix: spec("拦截请求→本地翻译", true, asBoolean),
  wsEnableResponseFix: spec("拦截响应→AI译文后修正", true, asBoolean),
  aiFixExportFormat: spec(
    "AI修正规则导出格式",
    "json" as "json" | "csv",
    asEnum(["json", "csv"] as const)
  ),
  mootHookEnabled: spec("启用 Moot wslikecmd HTTP 拦截", true, asBoolean),
  mootApiUrl: spec(
    "Moot API 地址",
    "http://127.0.0.1:64002/wslikecmd",
    asString
  ),
  mootInterceptRequest: spec("请求阶段本地翻译拦截", true, asBoolean),
  mootProcessResponse: spec("响应阶段 AI 译文后修正", true, asBoolean),
  mootDebug: spec("调试模式", false, asBoolean),
  cheatEnabled: spec("启用游戏修改器", false, asBoolean),
  cheatAutoApply: spec("修改器启动时自动应用", false, asBoolean),
} as const;

export type UserConfigKey = keyof typeof USER_CONFIG_SCHEMA;

type UserConfigShape = {
  [K in UserConfigKey]: ConfigField<
    ReturnType<(typeof USER_CONFIG_SCHEMA)[K]["coerce"]>
  >;
};

function createFields(): UserConfigShape {
  const out = {} as Record<string, ConfigField<any>>;
  for (const key of Object.keys(USER_CONFIG_SCHEMA) as UserConfigKey[]) {
    const s = USER_CONFIG_SCHEMA[key] as FieldSpec<any>;
    // 深拷贝默认值：避免对象/数组型默认值被用户值污染
    const def =
      typeof s.default === "object" && s.default !== null
        ? JSON.parse(JSON.stringify(s.default))
        : s.default;
    out[key] = new ConfigField<any>(s.description, def, def);
  }
  return out as UserConfigShape;
}

const SENSITIVE_KEYS = (
  Object.keys(USER_CONFIG_SCHEMA) as UserConfigKey[]
).filter((k) => (USER_CONFIG_SCHEMA[k] as FieldSpec<any>).sensitive);

export class ConfigStore {
  /** 响应式字段表：UI 通过 v-model 直接绑定 user.xxx.userConfig */
  public readonly user = reactive(createFields()) as unknown as UserConfigShape;

  private listeners = new Set<(changed: string[]) => void>();
  private store: KeyValueStorePort | null = null;
  private stopWatch: (() => void) | null = null;
  private _debug = false;

  // ==================== 读写 ====================

  get<K extends UserConfigKey>(key: K): any {
    const field = (this.user as any)[key] as ConfigField<any> | undefined;
    if (!field) return undefined;
    const v = field.userConfig;
    return v === undefined || v === null ? field.default : v;
  }

  set<K extends UserConfigKey>(key: K, value: any): void {
    const field = (this.user as any)[key] as ConfigField<any> | undefined;
    if (!field) return;
    const s = USER_CONFIG_SCHEMA[key] as FieldSpec<any>;
    field.userConfig = s.coerce(value, field.default);
  }

  get debug(): boolean {
    return this._debug || this.get("mootDebug") === true;
  }

  set debug(value: boolean) {
    this._debug = !!value;
  }

  /** 完整快照（普通对象，供内核读取/持久化） */
  snapshot(): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of Object.keys(USER_CONFIG_SCHEMA) as UserConfigKey[]) {
      out[key] = this.get(key);
    }
    return out;
  }

  /** 脱敏快照（导出给用户看） */
  publicSnapshot(): Record<string, any> {
    const out = this.snapshot();
    for (const k of SENSITIVE_KEYS) if (out[k]) out[k] = "***";
    return out;
  }

  subscribe(listener: (changed: string[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 暴露给内核的只读端口（内核不直接接触响应式对象） */
  asReader(): ConfigReaderPort {
    return {
      get: (key: string) => this.get(key as UserConfigKey),
      subscribe: (listener) => this.subscribe(listener),
    };
  }

  private emit(changed: string[]): void {
    for (const l of this.listeners) {
      try {
        l(changed);
      } catch {
        /* ignore */
      }
    }
  }

  // ==================== 引擎开关 ====================

  getEngines(): Record<EngineType, boolean> {
    const raw = this.get("engines");
    return asEngineMap(raw, DEFAULT_ENGINES);
  }

  isEngineEnabled(engine: EngineType): boolean {
    return this.getEngines()[engine] ?? true;
  }

  // ==================== 持久化 ====================

  attachStorage(store: KeyValueStorePort): void {
    this.store = store;
  }

  loadFromStorage(): void {
    if (!this.store) return;
    const raw = this.store.get(STORAGE_KEYS.userConfig);
    if (!raw) return;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn("[MToolTranslatorPlugin] 用户配置解析失败，使用默认值");
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const changed: string[] = [];
    for (const key of Object.keys(USER_CONFIG_SCHEMA) as UserConfigKey[]) {
      if (!(key in parsed)) continue;
      const s = USER_CONFIG_SCHEMA[key] as FieldSpec<any>;
      const field = (this.user as any)[key] as ConfigField<any>;
      const next = s.coerce(parsed[key], field.default);
      if (next !== field.userConfig) {
        field.userConfig = next;
        changed.push(key);
      }
    }
    if (changed.length) this.emit(changed);
  }

  saveToStorage(): void {
    if (!this.store) return;
    this.store.set(STORAGE_KEYS.userConfig, JSON.stringify(this.snapshot()));
  }

  /** 自动保存（配置变化后防抖落盘），返回取消函数 */
  enableAutoSave(delay: number): () => void {
    if (this.stopWatch) this.stopWatch();
    let timer: ReturnType<typeof setTimeout> | null = null;
    this.stopWatch = watch(
      () => this.snapshot(),
      () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          this.saveToStorage();
        }, delay);
      },
      { deep: true }
    );
    return () => {
      if (timer) clearTimeout(timer);
      this.stopWatch?.();
      this.stopWatch = null;
    };
  }

  dispose(): void {
    this.stopWatch?.();
    this.stopWatch = null;
    this.listeners.clear();
  }
}

export { LANG_LABEL };
