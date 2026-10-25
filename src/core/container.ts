/**
 * core/container.ts — 组合根（Composition Root）
 *
 * 整个插件唯一允许「跨模块 new」的地方：
 *   基础设施 → 配置 → 引擎 → Hook → 修改器，逐层注入。
 * 其它模块之间只依赖接口或注入的回调，不反向 new 具体实现。
 *
 * 同时统一持有 DisposableScope：dispose() 一次释放全部定时器 / Hook / 补丁。
 */

import { DisposableScope, type Disposable } from "./domain/disposable";
import type { LoggerPort } from "./domain/ports";
import { SafeStorage, STORAGE_PREFIX } from "./infrastructure/storage";
import { RingLogger } from "./infrastructure/logger";
import { Scheduler } from "./infrastructure/scheduler";
import { Metrics } from "./infrastructure/metrics";
import { ConfigStore } from "./config/config-store";
import { Translator } from "./engine/translator";
import { AiTranslator } from "./engine/ai-translator";
import { HookManager } from "./hooks/hook-manager";
import { MootHookManager } from "./hooks/moot-hook";
import { CheatManager } from "./cheat/cheat-manager";
import { rawHttp } from "./platform/env";

export interface ContainerOptions {
  storagePrefix?: string;
  consoleLog?: boolean;
}

export class Container implements Disposable {
  readonly scope = new DisposableScope();

  readonly storage = new SafeStorage(STORAGE_PREFIX);
  readonly logger: RingLogger;
  readonly config = new ConfigStore();
  readonly scheduler = new Scheduler();
  readonly metrics = new Metrics();

  readonly aiTranslator: AiTranslator;
  readonly translator: Translator;
  readonly hookManager: HookManager;
  readonly mootHook: MootHookManager;
  readonly cheat: CheatManager;

  private installed = false;

  constructor(options: ContainerOptions = {}) {
    // ---- 基础设施 ----
    this.logger = new RingLogger({
      maxCount: Number(this.config.get("maxLogCount") ?? 50),
      consoleEnabled: options.consoleLog ?? false,
    });
    this.scope.add(() => this.logger.dispose());
    this.scope.add(() => this.scheduler.dispose());

    // ---- 配置 ----
    this.config.attachStorage(this.storage);
    this.config.loadFromStorage();
    this.scope.add(this.config.enableAutoSave(800));
    this.scope.add(() => this.config.dispose());
    this.logger.setConsoleEnabled(this.config.debug === true || options.consoleLog === true);

    const configReader = this.config.asReader();

    // ---- 引擎 ----
    this.aiTranslator = new AiTranslator({
      http: rawHttp,
      config: configReader,
      logger: this.logger as LoggerPort,
      scheduler: this.scheduler,
      metrics: this.metrics,
    });
    this.scope.add(() => this.aiTranslator.dispose());

    this.translator = new Translator({
      config: configReader,
      logger: this.logger as LoggerPort,
      scheduler: this.scheduler,
      storage: this.storage,
      metrics: this.metrics,
      aiTranslator: this.aiTranslator,
    });
    this.scope.add(() => this.translator.destroy());

    // ---- Hook ----
    this.hookManager = new HookManager({
      config: configReader,
      logger: this.logger as LoggerPort,
      scheduler: this.scheduler,
      translate: (text) => this.translator.translate(text),
      rememberOriginal: (text) => this.translator.addTranslation(text),
    });
    this.scope.add(() => this.hookManager.dispose());
    // 引擎 Hook 由 translator 按需触发（重装时统一入口）
    this.translator.setHookInstaller(() => {
      this.hookManager.install();
      return () => {};
    });

    // ---- Moot ----
    this.mootHook = new MootHookManager({
      config: configReader,
      logger: this.logger as LoggerPort,
      scheduler: this.scheduler,
      translate: (text) => this.translator.translate(text),
      fixResponse: (original, aiResult) =>
        this.translator.fixAITranslation(original, aiResult),
      addFixRule: (aaa, bbb, ccc) => this.translator.addAIFixRule(aaa, bbb as any, ccc),
      clearFixRules: () => this.translator.fixRules.clear(),
      statsProvider: () => ({ cacheHitRate: this.translator.stats.cacheHitRate }),
      ruleCountProvider: () => this.translator.fixRules.count,
    });
    this.scope.add(() => this.mootHook.dispose());

    // ---- 修改器 ----
    this.cheat = new CheatManager({
      logger: this.logger as LoggerPort,
      storage: this.storage,
      scheduler: this.scheduler,
    });
    this.scope.add(() => this.cheat.dispose());

    // 目标语言变化 → 刷新过滤器
    this.scope.add(
      this.config.subscribe((changed) => {
        if (changed.includes("maxLogCount")) {
          this.logger.setMaxCount(Number(this.config.get("maxLogCount") ?? 50));
        }
        if (changed.includes("debug")) {
          this.logger.setConsoleEnabled(this.config.debug === true);
        }
        if (changed.includes("enableAI") || changed.includes("AI_KEY") || changed.includes("AI_BASE_URL")) {
          this.aiTranslator.updateConfig();
        }
      })
    );
  }

  /** 安装插件：初始化引擎 → 装 Hook → 按需启用 Moot / 修改器 */
  install(): void {
    if (this.installed) return;
    this.installed = true;

    this.translator.init();

    const fileName = String(this.config.get("fileName") ?? "");
    if (this.config.get("autoLoad") === true && fileName && fileName !== "default.json") {
      void this.translator.loadTranslationData(fileName);
    }

    this.translator.installHooks();

    if (this.config.get("mootHookEnabled") === true) {
      this.mootHook.install({
        apiUrl: String(this.config.get("mootApiUrl") ?? ""),
      });
    }

    if (this.config.get("cheatEnabled") === true && this.config.get("cheatAutoApply") === true) {
      this.scheduler.timeout(() => {
        try {
          this.cheat.apply();
        } catch (e) {
          this.logger.warn(`[Cheat] 自动应用失败: ${e}`);
        }
      }, 800);
    }

    // 页面卸载前落盘（防抖版本会丢最后一次写入）
    if (typeof window !== "undefined") {
      const onLeave = () => {
        this.translator.saveUserData(true);
        this.config.saveToStorage();
      };
      window.addEventListener("beforeunload", onLeave);
      this.scope.add(() => window.removeEventListener("beforeunload", onLeave));
    }

    this.logger.success("MToolTranslatorPlugin 已启动");
  }

  dispose(): void {
    this.installed = false;
    this.scope.dispose();
  }
}

/** 默认全局容器（main.ts 与 UI 共用） */
export const container = new Container();
export default container;
