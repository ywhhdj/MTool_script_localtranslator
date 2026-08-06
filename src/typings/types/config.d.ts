declare namespace Config {
  type AITranslateOptions = {
    sourceLang?: string;
    targetLang?: string;
    systemPrompt?: string;
    timeout?: number;
    maxRetries?: number;
  }
  type UserConfigItem<T = any> = {
    description: string;
    default: T;
    userConfig: T;
  }
}