import config from './config';
import translator from './core/translator';
import cache from './core/cache';
import logger, { LogLevel } from './core/logger';
import aiTranslator from './core/aiTranslator';

export function install() {
  if (config.user.autoLoad.userConfig) {
    translator.init();
    const defaultFile = config.user.fileName.userConfig;
    if (defaultFile && defaultFile !== 'default.json') {
      translator.loadTranslationData(defaultFile);
    }
  }
}

window.MToolTranslatorPlugin = {
  translator,
  cache,
  logger,
  config,
  aiTranslator,
  load: (file: string | File) => {
    if (typeof file === 'string') return translator.loadTranslationData(file);
    return translator.loadFromFile(file);
  },
  export: (format?: string) => {
    const fmt = (format === 'csv' ? 'csv' : format === 'tsv' ? 'tsv' : 'json') as any;
    const { data, fileName } = translator.exportRules(fmt);
    const blob = new Blob([data], { type: fmt === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  },
  reset: () => translator.reset(),
  stats: () => translator.getStats(),
  log: (msg: string, level: LogLevel = LogLevel.INFO) => logger.addLog(msg, level),
  testAI: () => aiTranslator.translate('テスト'),
  clearAICache: () => aiTranslator.clearCache(),
};

logger.addLog('MToolTranslatorPlugin 翻译插件 v0.1.0 已启动', LogLevel.SUCCESS);
console.log('%c[MToolTranslatorPlugin] v0.1.0 Ready! 使用 window.MToolTranslatorPlugin 访问 API', 'color: #197dea; font-weight: bold;');

export default window.MToolTranslatorPlugin;