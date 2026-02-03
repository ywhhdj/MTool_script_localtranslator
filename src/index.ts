import Config, { Language, User } from './config.ts';
import LocalTranslatorUtil from './util.ts';
import Cache from './cache.ts';
import LocalTranslatorHook from './hook.ts';
import LocalTranslatorUI from './ui.ts';
import logger, { LogLevel } from './logger.ts';

interface regexRules {
  aaa: RegExp | string | null;
  bbb: RegExp | string | null;
  ccc: string;
}

interface translationData {
  simpleMap: Map<string, string>;
  regexRules: regexRules[];
}

class LocalTranslator {
  ui: LocalTranslatorUI;
  translationData: translationData | null = { simpleMap: new Map(), regexRules: [] };
  timeoutIdArray: NodeJS.Timeout[] = [];
  isCustomConfig: boolean = true;
  _skipSingleCharRegex: RegExp | null = /^[%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~!@#$。，、；：？！…—～（）｛｝【】《》￥$€£¥¢]$/;
  defaultSkipRules: RegExp | null = null;

  constructor() {
    this.ui = new LocalTranslatorUI();
    let userInfo = localStorage.getItem('user');
    if (userInfo) {
      const user = JSON.parse(userInfo) as User;
      Config.setUserConfig(user);
    }
  }

  isTargetLanguage(text: string): boolean {
    switch (Config.user.targetLang.userConfig) {
      case Language.zh_CN:
        // 中文包含中文字符且不包含假名
        return /[\u4e00-\u9fa5]/.test(text) && !/[\u3040-\u309f\u30a0-\u30ff]/.test(text);
      case Language.en:
        // 英文包含英文字符且包含数字
        return /^[\x00-\x7F]*$/.test(text) && /[a-zA-Z\d０-９]/.test(text);
    }
    return false;
  }

  isSkip(text: string): boolean {
    if (!text || typeof text !== 'string' || text.length > 500) return true;
    if (text.length === 1) {
      if (this._skipSingleCharRegex?.test(text)) return true;
    }
    if (this.defaultSkipRules?.test(text)) return true;
    return this.isTargetLanguage(text);
  }

  initLocalTranslatorConfig() {
    this.translationData = { simpleMap: new Map(), regexRules: this.jsonToArr(Config.TranslatorRules.default) };
    const skipPatterns = Config.defaultSkipRules.map(r => `(${r.source})`);
    this.defaultSkipRules = new RegExp(skipPatterns.join('|'));
  }

  start() {
    this.initLocalTranslatorConfig();
    this.hookGameEngineText();
    this.hookNetWork();
    this.createUI();
    logger.addLog('初始化完成', LogLevel.info);
    Cache.loadStorageCache('LocalTranslatorGameCache');
    this.loadTranslationData(Config.user.fileName.userConfig);
    window.addEventListener('beforeunload', () => this.destroy());
  }

  destroy() {
    this.ui.destroy();
    Cache.saveCacheToStorage('LocalTranslatorGameCache');
    if (Config.user.autoLoad.userConfig) this.saveTranslationData();
    Cache.clear();
    this.translationData = null;
    this.timeoutIdArray.forEach(id => clearTimeout(id));
    this._skipSingleCharRegex = null;
  }

  hookGameEngineText() {
    const self = this;
    this.timeoutIdArray.push(setTimeout(() => {
      LocalTranslatorHook.hookCanvasMessage((args) => {
        if (args[0].length > 1) args = self.interceptText(args);
        return args;
      });
      LocalTranslatorHook.hookBitmapMessage((args: any[]) => {
        if (args[0].length > 1) args = self.interceptText(args);
        return args;
      });
      LocalTranslatorHook.hookRPGMakerMessage(this.interceptText.bind(this));
      LocalTranslatorHook.hookPixiJSMessage(this.interceptText.bind(this));
      LocalTranslatorHook.hookCocosLabelMessage(this.interceptText.bind(this));
      logger.addLogs(['已挂钩 Canvas 文本渲染', '已挂钩 Bitmap 文本渲染', '已挂钩 RPGMaker 文本渲染', '已挂钩 PixiJS 文本渲染', '已挂钩 CocosLabel 文本渲染'], LogLevel.info);
    }, 1000));
  }

  interceptText(args: any[], aiTranslateText = ''): any[] {
    if (!args || !args[0] || typeof args[0] !== 'string') return args;
    const text = args[0];
    const cacheText = Cache.textCacheQurey(text);
    if (cacheText !== undefined) {
      args[0] = cacheText;
      return args;
    }
    const result = this.doFix(text, aiTranslateText);
    Cache.textCacheSet(text, result as string);
    args[0] = result;
    return args;
  }

  hookNetWork() {
    this.timeoutIdArray.push(setTimeout(() => {
      // LocalTranslatorHook.hookXhrResponse(this.interceptedUrls, this.interceptMethods, this.interceptAndModifyText.bind(this));
      LocalTranslatorHook.hookFectResponse((response, args) => { // 接收 args
        const url = args[0];
        console.log("[Translator] 拦截 fetch 响应数据:", response);
        return response;
      });
      LocalTranslatorHook.hookWebSocket((...args) => {
        const data = args[0].data;
        console.log("[Translator] 拦截 WebSocket 响应数据:", data);
        return args;
      });
    }, 1000));
  }

  async loadTranslationData(fileName: string) {
    if (Config.user.fileName.default !== fileName && Config.user.autoLoad.userConfig) {
      try {
        const savedData = localStorage.getItem(`cache_${fileName}`);
        if (savedData) {
          const parsedData = JSON.parse(savedData);
          this.translationData = {
            simpleMap: new Map(parsedData.simpleMap || []),
            regexRules: parsedData.regexRules || []
          };
        } else {
          const path = await LocalTranslatorUtil.getPath(fileName);
          const type = LocalTranslatorUtil.getFileType(path);
          let rawData;
          if (type === 'json') rawData = await LocalTranslatorUtil.getJSONFileData(path);
          else if (type === 'csv') rawData = await LocalTranslatorUtil.getCsvFileData(path);
          if (rawData) {
            const parsedData = this.parseConfig(rawData, fileName);
            if (parsedData) {
              this.processRules(parsedData);
              console.log("[Translator] 配置文件:", this.translationData);
              logger.addLog(`已初始化。配置文件: ${fileName}`, LogLevel.success);
            }
          }
        }
      } catch (e: any) {
        logger.addLog(`加载配置失败，请检查文件 ${fileName} 是否存在: ${e.message}`, LogLevel.error);
      }
    }
  }

  classifyRules(ruleArray: regexRules[]) {
    for (const entry of ruleArray) {
      const { aaa, bbb, ccc } = entry;
      if (bbb || aaa instanceof RegExp) {
        this.translationData?.regexRules.push(entry);
        continue;
      }
      if (typeof aaa === 'string') {
        this.translationData?.simpleMap.set(aaa, ccc);
        this.translationData?.regexRules.push(entry);
      }
    }
  }

  processRules(ruleArray: regexRules[] | object) {
    console.log("[Translator] 处理规则:", ruleArray);
    if (!ruleArray || typeof ruleArray !== 'object') return;
    this.translationData = { simpleMap: new Map(), regexRules: [] };
    try {
      if (this.isCustomConfig && Array.isArray(ruleArray)) {
        this.classifyRules(ruleArray);
      } else if (typeof ruleArray === 'object' && ruleArray !== null) {
        const ruleObj = ruleArray as Record<string, any>;
        for (const key of Object.keys(ruleObj)) {
          const item = ruleObj[key];
          if (Array.isArray(item)) {
            this.classifyRules(item);
          }
        }
      }
      console.log("[Translator] 规则处理完毕:", this.translationData);
    } catch (e: any) {
      console.error("[Translator] 规则处理发生错误:", e);
      logger.addLog('规则处理出错: ' + e.message, LogLevel.error);
    }
  }

  saveTranslationData() {
    if (this.translationData) {
      const saveData = {
        simpleMap: Array.from(this.translationData.simpleMap),
        regexRules: this.translationData.regexRules
      };
      localStorage.setItem(`cache_${Config.user.fileName.userConfig}`, JSON.stringify(saveData));
    }
  }

  collFormat(array: any[]) {
    return this.sortRule(array).map(item => ({
      aaa: item[0] ? LocalTranslatorUtil.parseRegex(item[0]) : null,
      bbb: item[1] ? LocalTranslatorUtil.parseRegex(item[1]) : null,
      ccc: item[2] || item[1]
    })).filter(item => (item.aaa && item.ccc) || (item.bbb && item.ccc));
  }

  collToArr(data: Record<string, any>): Record<string, regexRules[]> {
    let result: Record<string, regexRules[]> = {};
    for (const key in data) {
      const dataItem = data[key];
      const arr = dataItem.data;
      if (!Array.isArray(arr) || !arr.length) {
        continue;
      };
      if (Config.user.translatorName.userConfig || Config.user.transengine.userConfig) {
        if (dataItem.name === Config.user.translatorName.userConfig && dataItem.transengine === Config.user.transengine.userConfig) {
          result[key] = this.collFormat(arr);
        }
      } else {
        result[key] = this.collFormat(arr);
      }
    };
    return result;
  }

  jsonToArr(data: Record<string, any>): regexRules[] {
    return this.sortRule(Object.entries(data)).map(([k, v]: [string, any]) => ({
      aaa: k ? LocalTranslatorUtil.parseRegex(k) : null,
      bbb: null,
      ccc: v
    })).filter((item: regexRules) => item.aaa && item.ccc);
  }

  sortRule(result: any[]): any[] {
    return result.sort((a, b) => {
      const lenA = a[0].length || 0;
      const lenB = b[0].length || 0;
      if (lenA === lenB) return a[0].localeCompare(b[0]);
      return lenB - lenA; // 长度倒序，优先匹配长词
    });
  }

  parseConfig(data: any, fileName: string, customHandler?: (data: any) => regexRules[]): any {
    if (!data) return [];
    if (typeof customHandler === 'function') {
      return customHandler(data);
    }
    const fileType = LocalTranslatorUtil.getFileType(fileName);
    if (fileType === 'json') {
      try {
        if (typeof data === 'string') data = JSON.parse(data);
      } catch (err) {
        logger.addLog('JSON 格式错误:' + err, LogLevel.error);
        return [];
      }
      if (fileName === 'CollData.json') {
        return this.collToArr(data);
      }
      if (data instanceof Object) {
        if (!(data instanceof Array)) {
          return this.jsonToArr(data);
        } else {
          return this.collFormat(data);
        }
      }
    } else if (fileType === 'csv') {
      data = LocalTranslatorUtil.parseCSV(data);
      if (Array.isArray(data) && data.length > 0) {
        const firstRow = data[0];
        if (firstRow.length === 2 || firstRow.length === 3) { return this.collFormat(data); }
      }
    } else {
      logger.addLog(`${fileName} 格式警告: 检测到非标准多列数据，但文件名不是 CollData，已跳过处理。`, LogLevel.warning);
      return [];
    }
  }

  doFix(text: string, aiTranslateText?: string): string {
    if (!this.translationData || Cache.ignoretext.has(text) || this.isSkip(text)) {
      return text;
    }
    console.log("[Translator] 拦截文本:", text);
    const cached = Cache.get(text);
    if (cached !== undefined) {
      return cached;
    }
    let result = text;
    if (this.translationData.simpleMap.has(text)) {
      result = this.translationData.simpleMap.get(text) as string;
    } else {
      let count = 0;
      for (const entry of this.translationData.regexRules) {
        const nextResult = this.textReplace(result, entry, aiTranslateText);
        if (nextResult !== result) {
          result = nextResult;
          count += 1;
          if (count === Config.maxReplaceCount) {
            break;
          }
        }
      }
    }
    if (result !== text) {
      Cache.set(text, result);
      console.log(`[Translator] ${text.substring(0, 10)}... -> ${result.substring(0, 10)}...`);
    } else {
      Cache.ignoretext.add(text);
    }
    return result;
  }

  /**
  * 核心替换逻辑 (textReplace)
  * @param {string} text 原始文本
  * @param {object} entry 翻译规则 {aaa: /正则/|'替换文本', bbb: /正则/|'替换文本', ccc: '替换文本'}
  * @param {string} aiTranslateText AI翻译文本
  */
  textReplace(text: string, entry: regexRules, aiTranslateText?: string): string {
    const { aaa, bbb, ccc } = entry;
    if (typeof aaa === 'string' && text.indexOf(aaa) === -1) {
      return text;
    }
    let result = text;
    if (bbb !== null) {
      // 如果要求了 BBB，但 AI 文本为空或 BBB 规则本身无效，则保持原文
      if (!aiTranslateText) return text;
      let replaced;
      if (bbb instanceof RegExp) {
        bbb.lastIndex = 0;
        replaced = aiTranslateText.replace(bbb, ccc);
      } else {
        replaced = aiTranslateText.split(bbb).join(ccc);
      }
      if (!replaced || replaced === aiTranslateText) return text;
      return replaced;
    } else {
      if (aaa !== null) {
        let matched = false;
        // 1. 判断 AAA (原文) 是否匹配
        if (aaa instanceof RegExp) {
          if (aaa.test(text)) matched = true;
        } else {
          if (text.includes(aaa)) matched = true;
        }
        if (!matched) return text;
        if (aaa instanceof RegExp) {
          aaa.lastIndex = 0;
          result = text.replace(aaa, ccc);
        } else {
          result = text.split(aaa as string).join(ccc);
        }
      }
    }
    if (result && result !== text) {
      return result;
    }
    if (result === undefined) {
      result = text;
    }
    return result;
  }

  //自定义拦截和修改响应数据

  readFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    localStorage.removeItem(`cache_${Config.user.fileName.userConfig}`);
    Config.user.fileName.userConfig = file.name;
    this.isCustomConfig = (Config.user.fileName.userConfig !== Config.user.fileName.default);
    if (this.ui.dom.fileName) this.ui.dom.fileName.value = Config.user.fileName.userConfig;
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const content = e.target?.result;
        console.log(`${file.name} 原始内容:`, content);
        const parsedRules = this.parseConfig(content, file.name);
        const hasData = Array.isArray(parsedRules)
          ? parsedRules.length > 0
          : Object.keys(parsedRules).length > 0;
        if (hasData) {
          Cache.ignoretext.clear();
          this.processRules(parsedRules);
          alert('成功加载翻译条目:' + file.name);
          logger.addLog('成功加载翻译条目:' + file.name, LogLevel.success);
        }
      } catch (err) {
        logger.addLog('读取错误:' + err, LogLevel.error);
      } finally {
        target.value = '';
      }
    };
    reader.readAsText(file);
  }

  exportTranslatorJson() {
    const oriData = Cache.exportJson();
    let data: Record<string, any> = {};
    for (const [k, v] of Object.entries(oriData)) {
      const key = k.replace(Config.filterRule as RegExp, '');
      const value = v.replace(Config.filterRule as RegExp, '');
      data[key] = value;
    }
    const fileName = `LocalTranslator_${new Date().toLocaleDateString().replace(/\//g, '-')}_${Config.user.fileName.userConfig}`;
    LocalTranslatorUtil.saveFile(data, fileName, 'application/json');
    logger.addLog('成功导出翻译JSON:' + fileName, LogLevel.success);
  }

  createUI() {
    this.ui.createConfigUI((newCfg) => {
      localStorage.setItem('user', JSON.stringify(newCfg));
    }, this.exportTranslatorJson.bind(this));
    logger.logCallback = (text: string) => `[ ${new Date().toLocaleTimeString()} ]\n${text}`;
    this.ui.createLogElement();
    this.ui.createBtn(() => {
      if (this.ui.dom.input) {
        this.ui.dom.input.click();
      };
    });
    this.ui.createLeftBtn();
    this.ui.createInputElement(this.readFileChange.bind(this));
    this.ui.show();
  }
}

export default LocalTranslator;