import { reactive } from 'vue';
import { EngineType, Language } from './typings/enum';
import { safeJSONParse } from './utils';

export const Lang: Record<Language, string> = {
  [Language.en]: 'English',
  [Language.zh_CN]: '简体中文',
  [Language.zh_TW]: '繁體中文',
  [Language.ja]: '日本語',
  [Language.ko]: '한국어',
};

const defaultEngines: Record<EngineType, boolean> = {
  [EngineType.RPGMaker]: true,
  [EngineType.PixiJS]: true,
  [EngineType.Cocos2d]: true,
  [EngineType.Canvas2D]: true,
  [EngineType.Bitmap]: true,
  [EngineType.Phaser]: true,
  [EngineType.XHR]: true,
  [EngineType.WebSocket]: false,
  [EngineType.Fetch]: false
};

interface ConfigField<T> {
  description: string;
  default: T;
  userConfig: T;
}

class ConfigFieldStore<T> implements ConfigField<T> {
  description: string;
  default: T;
  userConfig: T;

  constructor(description: string, defaultVal: T, userConfig: T) {
    this.description = description;
    this.default = defaultVal;
    this.userConfig = userConfig;
  }
}

class ConfigStore {
  maxCacheSize = 10000;
  maxLogCount = 50;
  maxReplaceCount = 1;
  debug = false;
  defaultSkipRules: RegExp[] = [
    /^[-+]?[\d０-９:\-\s]+(?:\.[\d]+)?[%￥\$€£¥¢GＧ]?(?:\/[\d０-９]+)?$/,
    /^[A-Za-z\s\.]$/,
    /^<.+?>$/,
    /^[\%\^&\*\(\)_\+-=\[\]{};'\:"\\\|,\.\<\>\/\?`~\!@#\$。，、；：？\！…—～（）｛｝【】《》￥\$€£¥¢]+$/,
    /^[\s\r\n\t\v\f\u00A0\u1680\u180e\u2000-\u200b\u202f\u205f\u3000\uFEFF]+$/,
    /^\s*(?:O(?:FF|N))|[HMT]P|(?:BG)?[MS]E?|Miss|Lv|CG\s*$/i,
  ];
  punctuation: Record<string, string> = {
    "…": '･･･',
    "０": '0',
    "１": '1',
    "２": '2',
    "３": '3',
    "４": '4',
    "５": '5',
    "６": '6',
    "７": '7',
    "８": '8',
    "９": '9'
  };

  filterRule = /[\\]+(?:(?:u001b)?C|c|v|S[AEM]|N|P|G)+(?:\[[(?:\d(?:-nb)?|double)]+\])?/g;

  public user = reactive({
    fileName: new ConfigFieldStore<string>(
      '翻译数据文件名',
      'default.json',
      ''
    ),
    autoLoad: new ConfigFieldStore<boolean>(
      '启动时自动加载缓存',
      true,
      true
    ),
    transengine: new ConfigFieldStore<string>(
      'MTool社区翻译引擎名',
      'Bing',
      ''
    ),
    translatorName: new ConfigFieldStore<string>(
      'MTool社区翻译修正名称',
      '常规通用性修正',
      ''
    ),
    targetLang: new ConfigFieldStore<Language>(
      '目标语言',
      Language.zh_CN,
      Language.zh_CN
    ),
    AI_BASE_URL: new ConfigFieldStore<string>(
      'AI API 基础 URL',
      'https://api.deepseek.com',
      ''
    ),
    AI_KEY: new ConfigFieldStore<string>(
      'AI API 密钥',
      '',
      ''
    ),
    model: new ConfigFieldStore<string>(
      'AI 模型名称',
      'deepseek-v4-flash',
      ''
    ),
    enableAI: new ConfigFieldStore<boolean>(
      '启用 AI 翻译回退',
      false,
      false
    ),
    aiTriggerThreshold: new ConfigFieldStore<number>(
      'AI翻译触发阈值',
      5,
      5
    ),
    engines: new ConfigFieldStore<Record<EngineType, boolean>>(
      '翻译引擎开关',
      defaultEngines,
      defaultEngines
    ),
    exportFormat: new ConfigFieldStore<"json" | "csv">(
      '导出文件格式',
      'json',
      'json'
    ),
    maxReplaceCount: new ConfigFieldStore<number>(
      '单次翻译最大替换次数',
      1,
      1
    ),
    maxLogCount: new ConfigFieldStore<number>(
      '最大日志条数',
      50,
      50
    ),
    hookWebSocket: new ConfigFieldStore<boolean>(
      '拦截 MTool AI 翻译 WebSocket',
      true,
      true
    ),
    wsTargetURL: new ConfigFieldStore<string>(
      'WS 目标地址',
      '127.0.0.1:64002',
      ''
    ),
    wsEnableRequestFix: new ConfigFieldStore<boolean>(
      '拦截请求→本地翻译',
      true,
      true
    ),
    wsEnableResponseFix: new ConfigFieldStore<boolean>(
      '拦截响应→AI译文后修正',
      true,
      true,
    ),
    aiFixExportFormat: new ConfigFieldStore<"json" | "csv">(
      'AI修正规则导出格式',
      'json',
      'json',
    ),
    mootHookEnabled: new ConfigFieldStore<boolean>(
      '启用 Moot wslikecmd HTTP 拦截',
      true,
      true,
    ),
    mootApiUrl: new ConfigFieldStore<string>(
      'Moot API 地址',
      'http://127.0.0.1:64002/wslikecmd',
      'http://127.0.0.1:64002/wslikecmd'
    ),
    mootInterceptRequest: new ConfigFieldStore<boolean>(
      '请求阶段本地翻译拦截',
      true,
      true,
    ),
    mootProcessResponse: new ConfigFieldStore<boolean>(
      '响应阶段 AI 译文后修正',
      true,
      true,
    ),
    mootDebug: new ConfigFieldStore<boolean>(
      '调试模式',
      false,
      false
    ),
    maxCacheSize: new ConfigFieldStore<number>(
      '最大缓存大小',
      30000,
      30000
    )
  });

  // 获取完整用户配置快照
  snapshot(): Record<string, any> {
    const result: Record<string, any> = {};
    Object.keys(this.user).forEach(key => {
      const field = (this.user as any)[key];
      result[key] = field?.userConfig ?? field;
    });
    return result;
  }

  // 获取引擎开关（合并默认值）
  getEngines(): Record<EngineType, boolean> {
    const userEngines = this.user.engines.userConfig || this.user.engines.default;
    return userEngines;
  }

  isEngineEnabled(engine: EngineType): boolean {
    return this.getEngines()[engine] ?? true;
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem('LocalTranslatorUserConfig');
      if (raw) {
        const parsed = safeJSONParse(raw);
        // 逐字段赋值，保持 reactive 代理
        for (const [key, field] of Object.entries(parsed)) {
          const target = (this.user as any)[key];
          if (target && typeof target === 'object' && 'userConfig' in target) {
            target.userConfig = field;
          }
        }
      }
    } catch (e) {
      console.warn('[MToolTranslatorPlugin] 恢复用户配置失败:', e);
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem('LocalTranslatorUserConfig', JSON.stringify(this.snapshot()));
    } catch (e) {
      console.warn('[MToolTranslatorPlugin] 保存用户配置失败:', e);
    }
  }

  // ---- 默认翻译规则 ----
  defaultRules: Record<string, string> = {
    '/Text Speed/': '文本播放速度',
    '/Settings|設定/': '设置',
    '/unseen text/': '未读文本',
    '常時ダッシュ': '保持冲刺状态',
    '/アイテム|ｱｲﾃﾑ/': '道具',
    '/ロード|load/': '加载',
    '/セーブ|save/': '保存',
    'コマンド記憶': '指令记忆',
    '/タッチ\s*UI/': '触摸UI',
    'home': '家',
    'ニューゲーム': '新游戏',
    '/コンティニュー|つづきから/': '继续游戏',
    'ゲーム終了': '结束游戏',
    'オプション': '选项',
    '/タイトル(?:画面)?に戻[する]|タイトルへ/': '返回标题画面',
    'ピクチャ': '图片',
    '/[お]?兄(?:さん|を)|おにい/': '哥哥',
    '/[お]?姉(?:さん)?/': '姐姐',
    '電車': '电车',
    '経験': '经验',
    'クイックメニュー': '快捷菜单',
    '/どのファイルを(?:加载|ロード)しますか？/': '要加载哪个存档？',
    '/どのファイルに(?:保存|セーブ)しますか？/': '要保存哪个存档？',
    'ボイス': '语音',
    'ファイル': '存档',
    '実績': '成就',
    'ステータス': '状态',
    'スキル': '技能',
  };
}

export const config = new ConfigStore();
config.loadFromStorage();

export default config;