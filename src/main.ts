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
    const apiUrl = config.user.mootApiUrl.userConfig || config.user.mootApiUrl.default;
    mootHook.install({ apiUrl });
  }
}

window.MToolTranslatorPlugin = {
  translator,
  cache,
  logger,
  config,
  aiTranslator,
  load: (...args: any[]): Promise<boolean | void> => {
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
  // README 中约定的 Moot Hook 入口，之前未挂到全局，控制台里完全访问不到
  moot: {
    install: (opts?: Parameters<typeof mootHook.install>[0]) => mootHook.install(opts),
    autoInstall: (opts?: Parameters<typeof mootHook.install>[0]) => mootHook.autoInstall(opts),
    uninstall: () => mootHook.uninstall(),
    loadRules: (file: File) => mootHook.loadRulesFromFile(file),
    addRule: (aaa: string | RegExp, bbb: string | RegExp | null, ccc: string) =>
      mootHook.addRule(aaa, bbb, ccc),
    clearRules: () => mootHook.clearRules(),
    stats: () => mootHook.getStats(),
    resetStats: () => mootHook.resetStats(),
    updateConfig: (opts: Parameters<typeof mootHook.updateConfig>[0]) => mootHook.updateConfig(opts),
    test: (text: string) => mootHook.testTranslate(text),
  },
};

install();

logger.addLog('MToolTranslatorPlugin v0.2.0 已启动', LogLevel.SUCCESS);
console.log('%c[MToolTranslatorPlugin] v0.2.0 Ready! ', 'color: #197dea; font-weight: bold;');
console.log('%c[MootHook] window.MToolTranslatorPlugin 访问 MootHookAPI', 'color: #9b59b6; font-weight: bold;');

export default window.MToolTranslatorPlugin;
