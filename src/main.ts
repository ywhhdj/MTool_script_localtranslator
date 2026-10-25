/**
 * main.ts — 插件入口
 *
 * 职责：装配容器、安装内核、暴露稳定的全局 API（window.MToolTranslatorPlugin）。
 * 不包含任何业务逻辑。
 */

import { container } from "./core/container";
import {
  cache,
  config,
  logger,
  translator,
  aiTranslator,
  mootHook,
} from "./core";
import {
  downloadDelimited,
  downloadJson,
  getGameName,
  timestampFileName,
} from "./core/io/files";
import { LogLevel } from "./typings/enum";

container.install();

const plugin = {
  /** 版本 */
  version: "0.3.0",
  translator,
  cache,
  logger,
  config,
  aiTranslator,
  mootHook,
  cheat: container.cheat,

  /** 加载翻译文件（File 或文件名） */
  load: (...args: any[]): Promise<any> => {
    const file = args[0];
    if (typeof file === "string") return translator.loadTranslationData(file);
    return translator.loadFromFile(file);
  },

  /** 导出翻译数据 */
  export: async (format: "json" | "csv" | "tsv" = "json"): Promise<void> => {
    const { data, fileName } = translator.exportTranslationData(format);
    if (format === "json") downloadJson(data, fileName);
    else
      downloadDelimited(
        data as string[][],
        fileName,
        format === "csv" ? "," : "\t"
      );
  },

  reset: () => translator.reset(),
  stats: () => translator.stats,
  log: (text: string, level: LogLevel = LogLevel.INFO) =>
    logger.addLog(text, level as any),
  testAI: () => aiTranslator.translate("テスト"),
  setDebug: (debug: boolean) => logger.setConsoleEnabled(debug),
  hookAPI: () => translator.installHooks(),
  save: () => translator.saveUserData(true),
  dispose: () => container.dispose(),

  moot: {
    install: (opts?: Parameters<typeof mootHook.install>[0]) =>
      mootHook.install(opts ?? {}),
    autoInstall: (opts?: Parameters<typeof mootHook.install>[0]) =>
      mootHook.autoInstall(opts ?? {}),
    uninstall: () => mootHook.uninstall(),
    loadRules: (file: File) => mootHook.loadRulesFromFile(file),
    addRule: (aaa: string | RegExp, bbb: string | RegExp | null, ccc: string) =>
      mootHook.addRule(aaa, bbb, ccc),
    clearRules: () => mootHook.clearRules(),
    stats: () => mootHook.getStats(),
    resetStats: () => mootHook.resetStats(),
    updateConfig: (opts: Parameters<typeof mootHook.updateConfig>[0]) =>
      mootHook.updateConfig(opts ?? {}),
    test: (text: string) => mootHook.testTranslate(text),
  },
};

if (typeof window !== "undefined") {
  (window as any).MToolTranslatorPlugin = plugin;
}

logger.addLog("MToolTranslatorPlugin v0.3.0 已启动", LogLevel.SUCCESS as any);

export { getGameName, timestampFileName };
export default plugin;
