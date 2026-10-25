# MTool 翻译引擎

##  目录结构

```
src/
├── main.ts                    # 入口：装配容器 + 暴露全局 API
├── main.css
├── core/
│   ├── domain/                # 类型与端口（零依赖）
│   │   ├── types.ts
│   │   ├── ports.ts           # LoggerPort / KeyValueStorePort / SchedulerPort ...
│   │   └── disposable.ts      # 资源释放契约 DisposableScope
│   ├── platform/env.ts        # window / resolveGlobal / rawHttp
│   ├── infrastructure/
│   │   ├── logger.ts          # 环形缓冲 + 节流提交 + 重复合并
│   │   ├── scheduler.ts       # 定时器统一托管（可 cancel / dispose）
│   │   ├── storage.ts         # 带前缀、配额保护的存储
│   │   └── metrics.ts         # 热路径只做加法
│   ├── config/
│   │   ├── defaults.ts        # 默认规则 / 跳过规则 / 标点表
│   │   └── config-store.ts    # schema 驱动的类型安全配置
│   ├── text/                  # normalizer / filters
│   ├── datastruct/            # bloom-filter / lru-cache / regex-index
│   ├── rules/                 # rule-store / ai-fix-rules / rule-compactor
│   ├── io/                    # delimited / parsers / format-detector / files / http
│   ├── engine/                # translator / translation-pipeline / ai-translator
│   ├── hooks/                 # hook-registry / engine-hooks / network-hooks
│   │                          # websocket-hook / moot-hook / hook-manager
│   ├── cheat/                 # cheat-manager + engines/*
│   ├── container.ts           # 组合根
│   └── index.ts               # 内核 Facade（UI 唯一入口）
├── ui/
│   ├── App.vue                # 主面板
│   ├── components/            # 业务面板（Settings / Stats / Moot / Files / Logs / Cheat）
│   ├── components/base/       # Icon / Code
│   └── composables/           # （心跳由 shared/useHeartbeat 提供）
├── shared/                    # 表现层共享工具（下载 / 文件名 / 全局心跳）
└── typings/                   # 全局类型声明
```

---

## 本地构建

```bash
pnpm install        # 或 npm install / yarn
pnpm dev            # 开发调试
pnpm build          # 产出 dist/mtool-translator-plugin.js（单文件 IIFE）
pnpm typecheck      # vue-tsc 类型检查
```

---

## 对外 API

```js
MToolTranslatorPlugin.load(fileOrName)        // 加载翻译文件
MToolTranslatorPlugin.export('json'|'csv')    // 导出
MToolTranslatorPlugin.stats()                 // 统计
MToolTranslatorPlugin.reset()
MToolTranslatorPlugin.setDebug(true)
MToolTranslatorPlugin.moot.install({...})     // Moot 拦截
MToolTranslatorPlugin.moot.addRule(aaa, bbb, ccc)
MToolTranslatorPlugin.moot.stats()
```

控制台调试：

```js
MToolTranslatorPlugin.translator.stats          // 规则 / 缓存 / Bloom 统计
MToolTranslatorPlugin.translator.getAIFixRules() // 当前 aaa/bbb/ccc 规则
MToolTranslatorPlugin.logger.log_queue          // 最近日志
MToolTranslatorPlugin.dispose()                 // 一次性释放全部 Hook 与定时器
```
