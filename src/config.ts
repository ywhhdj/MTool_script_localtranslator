interface FieldConfig {
  description: string;
  readonly default: any;
  userConfig: any;
}
export enum Language {
  en = 'en',
  zh_CN = 'zh-CN',
}

export const Lang: Record<Language, string> = {
  [Language.en]: '英文',
  [Language.zh_CN]: '中文',
};

export interface User {
  fileName: string;
  autoLoad: boolean;
  transengine: string;
  translatorName: string;
  targetLang: Language;
}

export interface UserConfig {
  fileName: FieldConfig;
  autoLoad: FieldConfig;
  transengine: FieldConfig;
  translatorName: FieldConfig;
  AI_BASE_URL: FieldConfig;
  AI_KEY: FieldConfig;
  model: FieldConfig;
  targetLang: FieldConfig;
}

class LocalTranslatorConfig {
  maxCacheSize: number = 30000;//最大缓存翻译数,超过清除多余
  maxLogCount: number = 10;//不建议太大,容易导致性能问题
  maxReplaceCount: number = 1;//最大替换次数,默认1次避免影响性能
  defaultSkipRules: RegExp[] = [
    /^[-+]?[\d０-９:-\s]+(?:\.[\d]+)?[%￥\$€£¥¢GＧ]?(?:\/[\d０-９]+)?$/,
    /^[A-Za-z\s\.]$/,
    /^<.+?>$/,
    /^[%\^&\*\(\)_\+-=\[\]{};'\:"\\\|,\.\<\>\/\?`~\!@#\$。，、；：？\！…—～（）｛｝【】《》￥\$€£¥¢Ｇ]+$/,
    /^[\s\r\n\t\v\f\u00A0\u1680\u180e\u2000-\u200b\u202f\u205f\u3000\uFEFF]+$/,
    /^\s*(?:O(?:FF|N))\s*$/,
  ];
  filterRule: RegExp = /[\\]+(?:(?:u001b)?C|c|v|S[AEM]|N|P|G)+(?:\[[(?:\d(?:-nb)?|double)]+\])?/g;
  user: UserConfig = {
    fileName: {
      description: '数据文件名',
      default: 'default.json',
      userConfig: 'default.json',
    },
    autoLoad: {
      description: '是否自动加载配置',
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
      description: 'AI 基础 URL',
      default: 'https://api.deepseek.com',
      userConfig: '',
    },
    AI_KEY: {
      description: 'AI API 密钥',
      default: '',
      userConfig: '',
    },
    model: {
      description: 'AI 模型',
      default: 'deepseek-chat',
      userConfig: '',
    },
  };
  TranslatorRules = {
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
      'home': '家',
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
      'ファイル': '存档'
    },
    description: '日语翻译条目',
  };

  public setUserConfig(user: User) {
    this.user.fileName.userConfig = user.fileName || this.user.fileName.default;
    this.user.fileName.userConfig = user.autoLoad || this.user.autoLoad.default;
    this.user.transengine.userConfig = user.transengine || this.user.transengine.default;
    this.user.translatorName.userConfig = user.translatorName || this.user.translatorName.default;
  }
  public get getUserConfig(): User {
    return {
      fileName: this.user.fileName.userConfig || this.user.fileName.default,
      autoLoad: this.user.autoLoad.userConfig || this.user.autoLoad.default,
      transengine: this.user.transengine.userConfig || this.user.transengine.default,
      translatorName: this.user.translatorName.userConfig || this.user.translatorName.default
    };
  }
}
const Config = new LocalTranslatorConfig();
export default Config;