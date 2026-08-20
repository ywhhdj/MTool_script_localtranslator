import config from './config';
import translator from './core/translator';
import cache from './core/cache';
import logger, { LogLevel } from './core/logger';
import aiTranslator from './core/aiTranslator';
import mootHook from './core/mootHook';
import { download } from './utils';
import { installEngineHooks } from './core/hookManager';

function install() {
  if (config.user.autoLoad.userConfig) {
    translator.init();
    const defaultFile = config.user.fileName.userConfig;
    if (defaultFile && defaultFile !== config.user.fileName.default) {
      translator.loadTranslationData(defaultFile);
    }
  }

  if (config.user.mootHookEnabled.userConfig) {
    const apiUrl = config.user.mootApiUrl.userConfig || config.user.AI_BASE_URL.default;
    mootHook.install({ apiUrl });
  }
}

window.MToolTranslatorPlugin = {
  translator,
  cache,
  logger,
  config,
  aiTranslator,
  load: (...args: any[]): Promise<boolean|void> => {
    const file = args[0];
    if (typeof file === 'string') return translator.loadTranslationData(file);
    return translator.loadFromFile(file);
  },
  export: async (...args: any[]) => {
    const format = args[0];
    const fmt = (format === 'csv' ? 'csv' : format === 'tsv' ? 'tsv' : 'json') as any;
    const { data, fileName } = translator.exportTranslationData(fmt);
    await download(data, fileName, fmt);
  },
  reset: () => translator.reset(),
  stats: () => translator.stats,
  log: (text: string, level: LogLevel = LogLevel.INFO) => logger.addLog(text, level),
  testAI: () => aiTranslator.translate('テスト'),
  setDebug: (debug: boolean) => config.debug = debug,
  hookAPI: installEngineHooks,
};

install();

logger.addLog('MToolTranslatorPlugin v0.2.0 已启动', LogLevel.SUCCESS);
console.log('%c[MToolTranslatorPlugin] v0.2.0 Ready! ', 'color: #197dea; font-weight: bold;');
console.log('%c[MootHook] window.MToolTranslatorPlugin 访问 MootHookAPI', 'color: #9b59b6; font-weight: bold;');

export default window.MToolTranslatorPlugin;