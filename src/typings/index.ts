import { EngineType, FileFormat, Language } from "./enum";

export type UserConfig = {
  fileName: Config.UserConfigItem<string>;
  autoLoad: Config.UserConfigItem<boolean>;
  transengine: Config.UserConfigItem<string>;
  translatorName: Config.UserConfigItem<string>;
  targetLang: Config.UserConfigItem<Language>;
  AI_BASE_URL: Config.UserConfigItem<string>;
  AI_KEY: Config.UserConfigItem<string>;
  model: Config.UserConfigItem<string>;
  maxReplaceCount: Config.UserConfigItem<number>;
  maxCacheSize: Config.UserConfigItem<number>;
  maxLogCount: Config.UserConfigItem<number>;
  enableAI: Config.UserConfigItem<boolean>;
  aiTriggerThreshold: Config.UserConfigItem<number>;
  engines: Config.UserConfigItem<Record<EngineType, boolean>>;
  exportFormat: Config.UserConfigItem<FileFormat>;
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