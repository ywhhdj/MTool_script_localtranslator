/**
 * config/defaults.ts — 默认配置与内置规则
 */

import { EngineType, Language } from "../../typings/enum";

export const LANG_LABEL: Record<Language, string> = {
  [Language.en]: "English",
  [Language.zh_CN]: "简体中文",
  [Language.zh_TW]: "繁體中文",
  [Language.ja]: "日本語",
  [Language.ko]: "한국어",
};

export const DEFAULT_ENGINES: Record<EngineType, boolean> = {
  [EngineType.RPGMaker]: true,
  [EngineType.PixiJS]: true,
  [EngineType.Cocos2d]: true,
  [EngineType.Canvas2D]: true,
  [EngineType.Bitmap]: true,
  [EngineType.Phaser]: true,
  [EngineType.XHR]: true,
  [EngineType.WebSocket]: false,
  [EngineType.Fetch]: false,
};

/** 标点归一表：把全角数字/省略号等统一成半角，提高规则命中率 */
export const PUNCTUATION_MAP: Record<string, string> = {
  "…": "･･･",
  "０": "0",
  "１": "1",
  "２": "2",
  "３": "3",
  "４": "4",
  "５": "5",
  "６": "6",
  "７": "7",
  "８": "8",
  "９": "9",
};

/**
 * 跳过规则：全部锚定到整串（外部使用时会被包成 ^(?:...)$），
 * 避免 "HP"/"Lv" 这类片段在任意位置命中导致整句被跳过。
 */
export const DEFAULT_SKIP_RULES: RegExp[] = [
  /^[-+]?[\d０-９:\-\s]+(?:\.[\d]+)?[%￥\$€£¥¢GＧ]?(?:\/[\d０-９]+)?$/,
  /^[A-Za-z\s\.]$/,
  /^<.+?>$/,
  /^[\%\^&\*\(\)_\+-=\[\]{};'\:"\\\|,\.\<\>\/\?`~\!@#\$。，、；：？！…—～（）｛｝【】《》￥\$€£¥¢]+$/,
  /^[\s\r\n\t\v\f  ᠎ -​  　﻿]+$/,
  /^\s*(?:O(?:FF|N)|[HMT]P|(?:BG)?[MS]E?|Miss|Lv|CG)\s*$/i,
];

/** 内置通用规则（键为 "/xxx/" 时按正则处理） */
export const DEFAULT_TRANSLATION_RULES: Record<string, string> = {
  "/Text Speed/": "文本播放速度",
  "/Settings|設定/": "设置",
  "/unseen text/": "未读文本",
  常時ダッシュ: "保持冲刺状态",
  "/アイテム|ｱｲﾃﾑ/": "道具",
  "/ロード|load/": "加载",
  "/セーブ|save/": "保存",
  コマンド記憶: "指令记忆",
  "/タッチs*UI/": "触摸UI",
  home: "家",
  ニューゲーム: "新游戏",
  "/コンティニュー|つづきから/": "继续游戏",
  ゲーム終了: "结束游戏",
  オプション: "选项",
  "/タイトル(?:画面)?に戻[する]|タイトルへ/": "返回标题画面",
  ピクチャ: "图片",
  "/[お]?兄(?:さん|を)|おにい/": "哥哥",
  "/[お]?姉(?:さん)?/": "姐姐",
  電車: "电车",
  経験: "经验",
  クイックメニュー: "快捷菜单",
  "/どのファイルを(?:加载|ロード)しますか？/": "要加载哪个存档？",
  "/どのファイルに(?:保存|セーブ)しますか？/": "要保存哪个存档？",
  ボイス: "语音",
  ファイル: "存档",
  実績: "成就",
  ステータス: "状态",
  スキル: "技能",
};

export const DEFAULT_AI_SYSTEM_PROMPT = `你是一个专业的游戏本地化翻译引擎。请将用户输入的文本翻译为{target_lang}。

规则：
1. 仅输出翻译结果，不要任何解释、注释或额外文本
2. 保持原文的换行符、占位符（如 %s、{0}、\\n）不变
3. 保持原文的标点符号风格
4. 专有名词（人名、地名、技能名）尽量音译或保留原文
5. 如果原文已经是目标语言，原样返回
6. 每次输入可能包含多行文本，逐行翻译，保持行数一致`;

export const STORAGE_KEYS = {
  userConfig: "UserConfig",
  cache: "GameCache",
  translationPrefix: "cache_",
} as const;
