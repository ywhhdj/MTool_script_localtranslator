/**
 * hooks/hook-manager.ts — Hook 装配层
 *
 * 单一职责：按配置把「渲染引擎 Hook / XHR / Fetch / 预翻译 Hook」装到页面上，
 * 并保证「重复安装幂等、卸载可还原」。不含任何翻译逻辑（全部依赖注入）。
 */

import type { Disposable, Disposer } from "../domain/disposable";
import type { ConfigReaderPort, LoggerPort, SchedulerPort } from "../domain/ports";
import { EngineHooks, installPreTranslateHook } from "./engine-hooks";
import { NetworkHooks } from "./network-hooks";
import { PrototypeHookRegistry } from "./hook-registry";

export interface HookManagerDeps {
  config: ConfigReaderPort;
  logger: LoggerPort;
  scheduler: SchedulerPort;
  /** 翻译入口 */
  translate: (text: string) => string;
  /** 记录原文（供后续 AI 学习使用） */
  rememberOriginal: (text: string) => void;
}

export class HookManager implements Disposable {
  private deps: HookManagerDeps;
  private engineHooks = new EngineHooks();
  private network = new NetworkHooks();
  private registry = new PrototypeHookRegistry();
  private preTranslateDisposer: Disposer | null = null;
  private installed = false;

  constructor(deps: HookManagerDeps) {
    this.deps = deps;
  }

  get isInstalled(): boolean {
    return this.installed;
  }

  get appliedHooks(): string[] {
    return this.engineHooks.appliedList;
  }

  /** 安装/刷新全部 Hook（幂等） */
  install(): void {
    const engines = (this.deps.config.get("engines") ?? {}) as Record<string, boolean>;
    this.engineHooks.install((text) => this.deps.translate(text), engines);

    // XHR：MTool 的 wslikecmd 接口（请求记录原文 + 响应本地修正）
    if (engines["xhr"] !== false) {
      this.network.installXhr(
        {
          urlPatterns: ["wslikecmd"],
          method: "POST",
          transformRequest: (body) => {
            try {
              const data = JSON.parse(body);
              if (
                data &&
                data.cmd === "trs" &&
                Array.isArray(data.args) &&
                typeof data.args[0] === "string" &&
                data.type === 1
              ) {
                this.deps.rememberOriginal(data.args[0].trim());
              }
            } catch {
              /* 非 JSON 请求体 → 忽略 */
            }
            return body;
          },
          transformResponse: (data) => {
            if (data && typeof data.ret === "string" && data.type === 1) {
              data.ret = this.deps.translate(data.ret);
            }
            return data;
          },
        },
        undefined
      );
    } else {
      this.network.uninstallXhr();
    }

    // Fetch：默认关闭（会遍历响应 JSON 的所有字符串，开销大且易误伤）
    if (engines["fetch"] === true) {
      this.network.installFetch({
        jsonOnly: true,
        transformResponse: (body) => this.transformJson(body),
      });
    } else {
      this.network.uninstallFetch();
    }

    // RPG Maker 预翻译
    if (engines["rpgmaker"] !== false && !this.preTranslateDisposer) {
      this.preTranslateDisposer = installPreTranslateHook(
        (text) => this.deps.translate(text),
        this.registry
      );
    }

    this.installed = true;
  }

  private transformJson(body: any): any {
    const translate = (s: string) => this.deps.translate(s);
    if (typeof body === "string") return translate(body);
    if (!body || typeof body !== "object") return body;
    const walk = (value: any, depth: number): any => {
      if (depth > 8) return value;
      if (typeof value === "string") return value.length >= 2 ? translate(value) : value;
      if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1));
      if (value && typeof value === "object") {
        const out: Record<string, any> = {};
        for (const key of Object.keys(value)) out[key] = walk(value[key], depth + 1);
        return out;
      }
      return value;
    };
    return walk(body, 0);
  }

  dispose(): void {
    this.engineHooks.dispose();
    this.network.dispose();
    this.preTranslateDisposer?.();
    this.preTranslateDisposer = null;
    this.registry.dispose();
    this.installed = false;
  }
}
