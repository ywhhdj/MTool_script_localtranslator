import { reactive } from 'vue';
import { EngineType, FileFormat, Language } from './typings/enum';
import type { AppOptions, UserConfig } from './typings';

export const Lang: Record<Language, string> = {
  [Language.en]: 'English',
  [Language.zh_CN]: '简体中文',
  [Language.zh_TW]: '繁體中文',
  [Language.ja]: '日本語',
  [Language.ko]: '한국어',
}

const defaultEngines: Record<EngineType, boolean> = {
  [EngineType.RPGMaker]: true,
  [EngineType.PixiJS]: true,
  [EngineType.Cocos2d]: true,
  [EngineType.Canvas2D]: true,
  [EngineType.Bitmap]: true,
  [EngineType.WebSocket]: false,
  [EngineType.Fetch]: false,
  [EngineType.XHR]: false,
}

export const config = reactive<AppOptions>({
  maxCacheSize: 30000,
  maxLogCount: 50,
  maxReplaceCount: 1,
  defaultSkipRules: [
    /^[-+]?[\d０-９:-\s]+(?:\.[\d]+)?[%￥\$€£¥¢GＧ]?(?:\/[\d０-９]+)?$/,
    /^[A-Za-z\s\.]$/,
    /^<.+?>$/,
    /^[%\^&\*\(\)_\+-=\[\]{};'\:"\\\|,\.\<\>\/\?`~\!@#\$。，、；：？\！…—～（）｛｝【】《》￥\$€£¥¢Ｇ]+$/,
    /^[\s\r\n\t\v\f\u00A0\u1680\u180e\u2000-\u200b\u202f\u205f\u3000\uFEFF]+$/,
    /^\s*(?:O(?:FF|N))\s*$/,
  ],
  filterRule: /[\\]+(?:(?:u001b)?C|c|v|S[AEM]|N|P|G)+(?:\[[(?:\d(?:-nb)?|double)]+\])?/g,
  user: {
    fileName: {
      description: '翻译数据文件名',
      default: 'default.json',
      userConfig: 'default.json',
    },
    autoLoad: {
      description: '启动时自动加载缓存',
      default: true,
      userConfig: true,
    },
    transengine: {
      description: 'MTool社区翻译引擎名',
      default: 'Bing',
      userConfig: '',
    },
    translatorName: {
      description: 'MTool社区翻译修正名称',
      default: '常规通用性修正',
      userConfig: '',
    },
    targetLang: {
      description: '目标语言',
      default: Language.zh_CN,
      userConfig: Language.zh_CN,
    },
    AI_BASE_URL: {
      description: 'AI API 基础 URL',
      default: 'https://api.deepseek.com',
      userConfig: '',
    },
    AI_KEY: {
      description: 'AI API 密钥',
      default: '',
      userConfig: '',
    },
    model: {
      description: 'AI 模型名称',
      default: 'deepseek-chat',
      userConfig: '',
    },
    maxReplaceCount: {
      description: '单次翻译最大替换次数',
      default: 1,
      userConfig: 1,
    },
    maxCacheSize: {
      description: '最大缓存条目数',
      default: 30000,
      userConfig: 30000,
    },
    maxLogCount: {
      description: '最大日志条数',
      default: 50,
      userConfig: 50,
    },
    enableAI: {
      description: '启用 AI 翻译回退',
      default: false,
      userConfig: false,
    },
    aiTriggerThreshold: {
      description: 'AI翻译触发阈值(连续未命中次数)',
      default: 5,
      userConfig: 5,
    },
    engines: {
      description: '翻译引擎开关',
      default: { ...defaultEngines },
      userConfig: { ...defaultEngines },
    },
    exportFormat: {
      description: '导出文件格式',
      default: FileFormat.JSON,
      userConfig: FileFormat.JSON,
    },
  },
  TranslatorRules: {
    default: {
      '/Text Speed/': '文本播放速度',
      '/Settings|設定/': '设置',
      '/unseen text/': '未读文本',
      '常時ダッシュ': '保持冲刺状态',
      '/アイテム|ｱｲﾃﾑ/': '道具',
      '/ロード|load/': '加载',
      '/セーブ|save/': '保存',
      'コマンド記憶': '指令记忆',
      '/タッチ\s*UI/': '触摸UI',
      home: '家',
      'ニューゲーム': '开始游戏',
      '/コンティニュー|つづきから/': '继续游戏',
      'オプション': '选项',
      'タイトル画面に戻す': '返回标题画面',
      'ピクチャ': '图片',
      '/[お]?兄(?:さん|を)|おにい/': '哥哥',
      '/[お]?姉(?:さん)?/': '姐姐',
      '電車': '电车',
      '経験': '经验',
      'クイックメニュー': '快捷菜单',
      'どのファイルを加载しますか？': '您想要加载哪个存档？',
      'ボイス': '语音',
      'ファイル': '存档',
    },
    description: '日语翻译条目',
  },
});

export function setUserConfig(user: Partial<Record<keyof UserConfig, any>>) {
  const u = config.user;
  if (user.fileName !== undefined) u.fileName.userConfig = user.fileName;
  if (user.autoLoad !== undefined) u.autoLoad.userConfig = user.autoLoad;
  if (user.transengine !== undefined) u.transengine.userConfig = user.transengine;
  if (user.translatorName !== undefined) u.translatorName.userConfig = user.translatorName;
  if (user.targetLang !== undefined) u.targetLang.userConfig = user.targetLang;
  if (user.AI_BASE_URL !== undefined) u.AI_BASE_URL.userConfig = user.AI_BASE_URL;
  if (user.AI_KEY !== undefined) u.AI_KEY.userConfig = user.AI_KEY;
  if (user.model !== undefined) u.model.userConfig = user.model;
  if (user.maxReplaceCount !== undefined) u.maxReplaceCount.userConfig = user.maxReplaceCount;
  if (user.maxCacheSize !== undefined) u.maxCacheSize.userConfig = user.maxCacheSize;
  if (user.maxLogCount !== undefined) u.maxLogCount.userConfig = user.maxLogCount;
  if (user.enableAI !== undefined) u.enableAI.userConfig = user.enableAI;
  if (user.aiTriggerThreshold !== undefined) u.aiTriggerThreshold.userConfig = user.aiTriggerThreshold;
  if (user.engines !== undefined) u.engines.userConfig = { ...defaultEngines, ...user.engines };
  if (user.exportFormat !== undefined) u.exportFormat.userConfig = user.exportFormat;
}

export function getUserConfig(): Record<string, any> {
  const u = config.user;
  return {
    fileName: u.fileName.userConfig || u.fileName.default,
    autoLoad: u.autoLoad.userConfig ?? u.autoLoad.default,
    transengine: u.transengine.userConfig || u.transengine.default,
    translatorName: u.translatorName.userConfig || u.translatorName.default,
    targetLang: u.targetLang.userConfig || u.targetLang.default,
    AI_BASE_URL: u.AI_BASE_URL.userConfig || u.AI_BASE_URL.default,
    AI_KEY: u.AI_KEY.userConfig || u.AI_KEY.default,
    model: u.model.userConfig || u.model.default,
    maxReplaceCount: u.maxReplaceCount.userConfig ?? u.maxReplaceCount.default,
    maxCacheSize: u.maxCacheSize.userConfig ?? u.maxCacheSize.default,
    maxLogCount: u.maxLogCount.userConfig ?? u.maxLogCount.default,
    enableAI: u.enableAI.userConfig ?? u.enableAI.default,
    aiTriggerThreshold: u.aiTriggerThreshold.userConfig ?? u.aiTriggerThreshold.default,
    engines: { ...defaultEngines, ...u.engines.userConfig },
    exportFormat: u.exportFormat.userConfig || u.exportFormat.default,
  };
}

export function loadUserConfigFromStorage() {
  try {
    const raw = localStorage.getItem('LocalTranslatorUserConfig');
    if (raw) {
      const parsed = JSON.parse(raw);
      setUserConfig(parsed);
    }
  } catch (e) {
    console.warn('[MTool] 恢复用户配置失败:', e);
  }
}

export function saveUserConfigToStorage() {
  try {
    localStorage.setItem('LocalTranslatorUserConfig', JSON.stringify(getUserConfig()));
  } catch (e) {
    console.warn('[MTool] 保存用户配置失败:', e);
  }
}

loadUserConfigFromStorage();

export default config;