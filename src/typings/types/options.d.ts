declare namespace Options {
  type AITranslateOptions = {
    sourceLang?: string;
    targetLang?: string;
    systemPrompt?: string;
    timeout?: number;
    maxRetries?: number;
    options?: {
      temperature?: number;
      maxTokens?: number;
    };
  };

  type CheatEngineKey = "auto" | "rpgmaker" | "generic";
  type CheatCapability = "gold" | "actor" | "item" | "drop";

  type UserConfigItem<T = any> = {
    description: string;
    default: T;
    userConfig: T;
  };

  type XHRHookOptions = {
    urlPatterns?: Array<string | RegExp>;
    method?: "GET" | "POST";
    transformRequest?: (body: string, url: string) => string | null;
    transformResponse?: (data: any, url: string) => any;
  };

  type FetchHookOptions = {
    shouldIntercept?: (url: string, options?: any) => boolean;
    transformRequest?: (args: any[]) => any[] | null;
    transformResponse?: (data: any, url: string, options?: any) => any;
    jsonOnly?: boolean;
  };

  type WebSocketHookOptions = {
    targetURL?: string;
    enableRequestFix?: boolean;
    enableResponseFix?: boolean;
    translateFn?: (text: string) => string | null;
    fixResponseFn?: (original: string, aiResult: string) => string;
    pendingTimeout?: number;
  };

  interface CheatEngineAdapter {
    key: string;
    name: string;
    desc: string;
    capabilities: CheatCapability[];
    detect(): boolean;
    apply(settings: CheatSettings, registry: unknown): string[];
    revert(registry: unknown): void;
  }

  interface CheatEngineInfo {
    key: string;
    name: string;
    desc: string;
    capabilities: CheatCapability[];
    available: boolean;
  }

  interface GoldSettings {
    enabled: boolean;
    multiplier: number;
    minGain: number;
    maxGold: number;
    setValue: number;
  }

  interface ActorSettings {
    expEnabled: boolean;
    expMultiplier: number;
    paramEnabled: boolean;
    paramBaseMultiplier: number;
    paramPlusMultiplier: number;
    paramMaxEnabled: boolean;
    paramMax: number;
    levelMaxEnabled: boolean;
    levelMax: number;
  }

  interface ItemSettings {
    enabled: boolean;
    multiplier: number;
    maxItems: number;
    dropEnabled: boolean;
    dropMultiplier: number;
    guaranteedDrop: boolean;
    giveAmount: number;
  }

  interface GenericSettings {
    enabled: boolean;
    script: string;
  }

  interface CheatSettings {
    enabled: boolean;
    engine: CheatEngineKey;
    gold: GoldSettings;
    actor: ActorSettings;
    item: ItemSettings;
    generic: GenericSettings;
  }

  interface CheatStats {
    enabled: boolean;
    applied: boolean;
    engine: string;
    engineName: string;
    patched: string[];
    supported: boolean;
  }
}
