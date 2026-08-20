import { EngineType, Language } from "./enum";

export type UserConfig = {
  fileName: Options.UserConfigItem<string>;
  autoLoad: Options.UserConfigItem<boolean>;
  transengine: Options.UserConfigItem<string>;
  translatorName: Options.UserConfigItem<string>;
  targetLang: Options.UserConfigItem<Language>;
  AI_BASE_URL: Options.UserConfigItem<string>;
  AI_KEY: Options.UserConfigItem<string>;
  model: Options.UserConfigItem<string>;
  maxReplaceCount: Options.UserConfigItem<number>;
  maxCacheSize: Options.UserConfigItem<number>;
  maxLogCount: Options.UserConfigItem<number>;
  enableAI: Options.UserConfigItem<boolean>;
  aiTriggerThreshold: Options.UserConfigItem<number>;
  engines: Options.UserConfigItem<Record<EngineType, boolean>>;
  exportFormat: Options.UserConfigItem<"json" | "csv">;
  hookWebSocket: Options.UserConfigItem<boolean>;
  wsTargetURL: Options.UserConfigItem<string>;
  wsEnableRequestFix: Options.UserConfigItem<boolean>;
  wsEnableResponseFix: Options.UserConfigItem<boolean>;
  aiFixExportFormat: Options.UserConfigItem<"json" | "csv">;
  mootHookEnabled: Options.UserConfigItem<boolean>;
  mootApiUrl: Options.UserConfigItem<string>;
  mootInterceptRequest: Options.UserConfigItem<boolean>;
  mootProcessResponse: Options.UserConfigItem<boolean>,
  mootDebug: Options.UserConfigItem<boolean>;
}

export type AppOptions = {
  maxCacheSize: number;
  maxLogCount: number;
  maxReplaceCount: number;
  defaultSkipRules: RegExp[];
  filterRule: RegExp;
  user: UserConfig;
  TranslatorRules: {
    default: Record<string, string>;
    description: string;
  };
}