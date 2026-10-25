/**
 * hooks/moot-hook.ts — Moot 平台（127.0.0.1:64002）AI 翻译拦截
 *
 * 职责：
 *   - 请求阶段：本地已有译文 → 直接伪造响应，跳过 AI（省钱、零延迟）；
 *   - 响应阶段：AI 译文 → aiFixRules 后修正 → 学习进主缓存；
 *   - 规则与统计。
 *
 *   1. aiFixRules 一份数据源，行为完全一致；
 *   2. WS 与 XHR 两条路径共用同一个计数器；
 *   3. autoInstall 的重试定时器 Scheduler 托管；
 *   4. updateConfig 走「卸载再装」，只更新 WS 选项。
 */

import type { Disposable } from "../domain/disposable";
import type { ConfigReaderPort, LoggerPort, SchedulerPort } from "../domain/ports";
import { WebSocketHook } from "./websocket-hook";
import { xhrRequest } from "../io/http";
import { parseRegexLiteral } from "../rules/ai-fix-rules";
import type { AiFixRuleInput } from "../domain/types";

export interface MootStats {
  enabled: boolean;
  installed: boolean;
  requestsSeen: number;
  requestsIntercepted: number;
  responsesSeen: number;
  responsesFixed: number;
  responsesLearned: number;
  cacheHitRate: string;
}

export interface MootInstallOptions {
  apiUrl?: string;
  interceptRequest?: boolean;
  processResponse?: boolean;
  debug?: boolean;
}

export interface MootHookDeps {
  config: ConfigReaderPort;
  logger: LoggerPort;
  scheduler: SchedulerPort;
  /** 本地翻译：命中返回译文，未命中返回原文本 */
  translate: (text: string) => string;
  /** AI 译文修正 + 学习 */
  fixResponse: (original: string, aiResult: string) => string;
  /** 写入共享的 aaa/bbb/ccc 规则库 */
  addFixRule: (aaa: string | RegExp, bbb: string | RegExp | "", ccc: string) => void;
  /** 清空共享规则库（返回清除条数） */
  clearFixRules: () => number;
  /** 统计来源（主缓存命中率） */
  statsProvider: () => { cacheHitRate: number };
  /** 规则条数（展示用） */
  ruleCountProvider: () => number;
}

export class MootHookManager implements Disposable {
  private wsHook: WebSocketHook | null = null;
  private config: ConfigReaderPort;
  private logger: LoggerPort;
  private scheduler: SchedulerPort;
  private deps: MootHookDeps;

  private enabled = false;
  private apiUrl = "http://127.0.0.1:64002/wslikecmd";
  private nextId = 1;
  private stats: MootStats = {
    enabled: false,
    installed: false,
    requestsSeen: 0,
    requestsIntercepted: 0,
    responsesSeen: 0,
    responsesFixed: 0,
    responsesLearned: 0,
    cacheHitRate: "0%",
  };

  constructor(deps: MootHookDeps) {
    this.deps = deps;
    this.config = deps.config;
    this.logger = deps.logger;
    this.scheduler = deps.scheduler;
    this.apiUrl = String(this.config.get("mootApiUrl") ?? this.apiUrl);
  }

  get isInstalled(): boolean {
    return this.enabled;
  }

  get ruleCount(): number {
    return this.deps.ruleCountProvider();
  }

  // ==================== 安装 ====================

  install(options: MootInstallOptions = {}): boolean {
    if (this.enabled) return false;

    this.apiUrl =
      options.apiUrl || String(this.config.get("mootApiUrl") ?? this.apiUrl);

    this.wsHook = new WebSocketHook(
      {
        targetURL: this.extractHost(this.apiUrl),
        enableRequestFix: options.interceptRequest ?? this.config.get("mootInterceptRequest") !== false,
        enableResponseFix: options.processResponse ?? this.config.get("mootProcessResponse") !== false,
        translateFn: (text) => {
          this.stats.requestsSeen++;
          try {
            const local = this.deps.translate(text);
            if (local && local !== text) {
              this.stats.requestsIntercepted++;
              return local;
            }
          } catch {
            /* 翻译异常 → 放行给 AI */
          }
          return null;
        },
        fixResponseFn: (original, aiResult) => this.fixResponse(original, aiResult),
      },
      { scheduler: this.scheduler, logger: this.logger }
    );

    const ok = this.wsHook.install();
    if (!ok) {
      this.wsHook = null;
      return false;
    }
    this.enabled = true;
    this.stats.enabled = true;
    this.stats.installed = true;
    this.logger.success(`[Moot] Hook 已安装 (API: ${this.apiUrl})`);
    return true;
  }

  uninstall(): void {
    if (this.wsHook) {
      this.wsHook.uninstall();
      this.wsHook = null;
    }
    this.enabled = false;
    this.stats.enabled = false;
    this.stats.installed = false;
    this.logger.info("[Moot] Hook 已卸载");
  }

  /** 启动时平台可能还没就绪：失败按间隔重试（定时器由 Scheduler 托管） */
  autoInstall(
    options: MootInstallOptions = {},
    retries: number = 10,
    interval: number = 1000
  ): void {
    if (this.enabled) return;
    const attempt = (left: number) => {
      if (this.enabled) return;
      const ok = this.install(options);
      if (ok || left <= 0) {
        if (!ok) this.logger.warn(`[Moot] 自动安装失败，已重试 ${retries} 次`);
        return;
      }
      this.scheduler.timeout(() => attempt(left - 1), interval);
    };
    attempt(retries);
  }

  updateConfig(options: MootInstallOptions = {}): void {
    if (options.debug !== undefined) this.logger.setConsoleEnabled(!!options.debug);
    if (!this.wsHook) return;
    if (options.apiUrl && options.apiUrl !== this.apiUrl) {
      // 地址变了才需要重装
      this.uninstall();
      this.install(options);
      return;
    }
    this.wsHook.updateOptions({
      enableRequestFix: options.interceptRequest,
      enableResponseFix: options.processResponse,
    });
  }

  // ==================== 响应处理 ====================

  private fixResponse(original: string, aiResult: string): string {
    this.stats.responsesSeen++;
    if (!aiResult || aiResult === original) return aiResult;
    let fixed = aiResult;
    try {
      fixed = this.deps.fixResponse(original, aiResult);
    } catch {
      fixed = aiResult;
    }
    if (fixed && fixed !== original) this.stats.responsesLearned++;
    if (fixed !== aiResult) this.stats.responsesFixed++;
    return fixed;
  }

  // ==================== 规则（统一写入共享规则库）====================

  addRule(aaa: string | RegExp, bbb: string | RegExp | null, ccc: string): void {
    const parsedAaa = typeof aaa === "string" ? parseRegexLiteral(aaa) : aaa;
    const parsedBbb =
      bbb === null || bbb === undefined
        ? ""
        : typeof bbb === "string"
        ? parseRegexLiteral(bbb)
        : bbb;
    this.deps.addFixRule(parsedAaa, parsedBbb, ccc);
  }

  clearRules(): void {
    const removed = this.deps.clearFixRules();
    this.logger.warn(`[Moot] 已清除 ${removed} 条后处理规则`);
  }

  async loadRulesFromFile(file: File): Promise<number> {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const { extractAiFixRules } = await import("../io/parsers");
    const { parseDelimited } = await import("../io/delimited");
    const { parseXlsx, readFileAsText } = await import("../io/files");
    let rules: Array<AiFixRuleInput> = [];
    if (ext === "json") {
      rules = extractAiFixRules(JSON.parse(await readFileAsText(file)));
    } else if (ext === "csv" || ext === "tsv") {
      const rows = parseDelimited(await readFileAsText(file), ext === "csv" ? "," : "\t");
      rules = extractAiFixRules(rows);
    } else if (ext === "xlsx" || ext === "xls") {
      rules = extractAiFixRules(await parseXlsx(file));
    } else {
      throw new Error(`不支持的文件格式: .${ext}`);
    }
    for (const r of rules) this.deps.addFixRule(r.aaa, r.bbb!, r.ccc);
    this.logger.success(`[Moot] 规则文件加载成功: ${file.name}（${rules.length} 条）`);
    return rules.length;
  }

  // ==================== 测试 ====================

  async testTranslate(text: string): Promise<string> {
    if (!this.enabled) throw new Error("Moot Hook 未启用");
    if (!text || !text.trim()) throw new Error("测试文本不能为空");

    const local = this.deps.translate(text);
    if (local && local !== text) return `[本地] ${local}`;

    const payload = {
      id: this.nextId++,
      type: 1,
      target: 1,
      cmd: "trs",
      args: [text],
    };
    const res = await xhrRequest<any>(this.apiUrl, "POST", {
      "Content-Type": "text/plain;charset=UTF-8",
    }, payload);
    if (!res.ok || !res.data) throw new Error(res.error || "Moot 无响应");
    if (res.data.type !== 1) throw new Error("Moot Hook 响应类型错误");
    if (res.data.error) throw new Error(res.data.ret || "未知 Moot 错误");
    const ret = String(res.data.ret ?? "");
    if (!ret) throw new Error("Moot Hook 响应内容为空");
    const fixed = this.fixResponse(text, ret);
    return `[AI回复] ${fixed}`;
  }

  // ==================== 统计 ====================

  getStats(): MootStats {
    const { cacheHitRate } = this.deps.statsProvider();
    this.stats.cacheHitRate = `${cacheHitRate}%`;
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      enabled: this.enabled,
      installed: this.enabled,
      requestsSeen: 0,
      requestsIntercepted: 0,
      responsesSeen: 0,
      responsesFixed: 0,
      responsesLearned: 0,
      cacheHitRate: "0%",
    };
  }

  dispose(): void {
    this.uninstall();
  }

  private extractHost(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      const m = url.match(/:\/\/([^/]+)/);
      return m ? m[1] : url;
    }
  }
}
