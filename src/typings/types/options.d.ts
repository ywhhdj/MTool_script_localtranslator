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
    }
  }

  type CheatEngineKey = "auto" | "rpgmaker" | "generic";

  /** 数值修改能力：金额 / 角色 / 物品 / 掉落 */
  type CheatCapability = "gold" | "actor" | "item" | "drop";

  type UserConfigItem<T = any> = {
    description: string;
    default: T;
    userConfig: T;
  }

  type XHRHookOptions = {
    urlPatterns?: Array<string | RegExp>;
    method?: "GET"|"POST";
    transformRequest?: (body: string, url: string) => string | null;
    transformResponse?: (data: any, url: string) => any;
  }

  type FetchHookOptions = {
    shouldIntercept?: (url: string, options?: any) => boolean;
    transformRequest?: (args: any[]) => any[] | null;
    transformResponse?: (data: any, url: string, options?: any) => any;
    jsonOnly?: boolean;
  }

  type WebSocketHookOptions= {
    targetURL?: string;
    enableRequestFix?: boolean;
    enableResponseFix?: boolean;
    translateFn?: (text: string) => string | null;
    fixResponseFn?: (original: string, aiResult: string) => string;
    pendingTimeout?: number;
  }

  export interface CheatEngineAdapter {
    /** 注册表 key */
    key: string;
    /** 显示名 */
    name: string;
    /** 说明 */
    desc: string;
    /** 支持的修改域（空数组 = 仅自定义脚本） */
    capabilities: CheatCapability[];
    /** 引擎可用性检测 */
    detect(): boolean;
    /** 注入补丁，返回已注入的方法清单（"Game_Party.gainGold" 形式） */
    apply(settings: CheatSettings): string[];
    /** 还原全部补丁 */
    revert(): void;
  }

  export interface CheatEngineInfo {
    key: string;
    name: string;
    desc: string;
    capabilities: CheatCapability[];
    available: boolean;
  }

  // ==================== 各域配置 ====================

  /** 金额 */
  export interface GoldSettings {
    /** 总开关 */
    enabled: boolean;
    /** 获得金币倍率（仅 amount > 0 时生效） */
    multiplier: number;
    /** 单次最少获得（保底），0 = 不启用 */
    minGain: number;
    /** 金币上限，0 = 沿用引擎默认 */
    maxGold: number;
    /** 快捷设定金币时的目标值 */
    setValue: number;
  }

  /** 角色属性·等级 */
  export interface ActorSettings {
    /** 经验倍率开关 */
    expEnabled: boolean;
    /** 获得经验倍率 */
    expMultiplier: number;
    /** 属性倍率开关（paramBase / paramPlus） */
    paramEnabled: boolean;
    /** 属性基础值倍率 */
    paramBaseMultiplier: number;
    /** 装备加成倍率 */
    paramPlusMultiplier: number;
    /** 参数上限开关 */
    paramMaxEnabled: boolean;
    /** 参数上限值 */
    paramMax: number;
    /** 等级上限开关 */
    levelMaxEnabled: boolean;
    /** 等级上限值 */
    levelMax: number;
  }

  /** 物品获取量 */
  export interface ItemSettings {
    /** 获得数量倍率开关 */
    enabled: boolean;
    /** 获得数量倍率（仅 amount > 0 时生效） */
    multiplier: number;
    /** 单格持有上限，0 = 沿用引擎默认（MV/MZ 默认 99） */
    maxItems: number;
    /** 掉落率开关 */
    dropEnabled: boolean;
    /** 掉落倍率 */
    dropMultiplier: number;
    /** 必掉（掉落率拉满） */
    guaranteedDrop: boolean;
    /** 快捷发放时的数量 */
    giveAmount: number;
  }

  /** 自定义脚本 */
  export interface GenericSettings {
    enabled: boolean;
    /** 用户脚本（可访问全部全局对象） */
    script: string;
  }

  export interface CheatSettings {
    /** 修改器总开关 */
    enabled: boolean;
    /** 引擎选择 */
    engine: CheatEngineKey;
    gold: GoldSettings;
    actor: ActorSettings;
    item: ItemSettings;
    generic: GenericSettings;
  }

  // ==================== 运行时状态 ====================

  export interface CheatStats {
    enabled: boolean;
    applied: boolean;
    engine: string;
    engineName: string;
    patched: string[];
    supported: boolean;
  }
}