# MTool 翻译引擎 v0.2.0

## 新增功能：Moot 平台 AI 翻译 Hook

拦截 Moot 平台内置 AI 翻译请求（`http://127.0.0.1:64002/wslikecmd`），在请求和响应阶段做智能处理。

---

## 工作流程

```
游戏 ──POST {cmd:"trs", args:[日文原文]}──▶ Moot API
                                              │
                    ┌─ mootHook 拦截请求 ─┤
                    │                         │
                    │  ① 本地翻译命中?     │
                    │     ├─ 是 → 伪造响应，跳过 AI ✅
                    │     └─ 否 → 放行，发真实请求
                    │                         │
                    │  ② 收到 AI 响应       │
                    │     → aiFixRules.fix() 后修正
                    │     → 替换 ret 字段     │
                    │                         │
                    ▼                         ▼
              本地翻译结果           修正后的 AI 译文
```

---

## 快速开始

### 方式一：自动安装（推荐）

```js
// main.ts 中已自动调用
mootHook.autoInstall({
  apiUrl: 'http://127.0.0.1:64002/wslikecmd'  // 可选，有默认值
});
```

启动游戏后 Moot Hook 会自动检测并安装，无需手动操作。

### 方式二：手动安装

```js
// 通过全局 API
MToolTranslatorPlugin.moot.install({
  apiUrl: 'http://127.0.0.1:64002/wslikecmd',
  interceptRequest: true,   // 请求阶段本地翻译拦截
  processResponse: true,     // 响应阶段 AI 译文后修正
  debug: false,              // 控制台输出调试信息
});
```

### 方式三：UI 面板

点击 MTool 面板 → **Moot** Tab → 打开开关即可。

---

## 后处理规则 (aaa / bbb / ccc)

### 规则逻辑

| 字段 | 含义 | 示例 |
|------|------|------|
| **aaa** | 原文匹配模式（字符串或正则） | `あははっ情報ありがとう` 或 `/情報/` |
| **bbb** | AI 译文中需包含的文本（过滤条件，可空） | `谢谢` 或 `/谢[谢谢]/` |
| **ccc** | 替换结果 | `啊哈哈 谢谢啦♪` |

### 匹配流程

```
收到 AI 响应: { ret: "啊哈哈 谢谢情报♪" }
                    │
                    ▼
        遍历后处理规则（aiFixRules）
                    │
        ┌─ aaa 匹配原文？ ── 否 → 跳过
        │
        └─ 是 → bbb 在 ret 中？
                    │
            ┌─ 有 bbb → ret 包含 bbb？
            │       ├─ 是 → ret 中 bbb 替换为 ccc ✅
            │       └─ 否 → 跳过
            │
            └─ bbb 为空 → 直接替换 ✅
```

### 规则示例

```js
// 例1：精确匹配 + 精确过滤
MToolTranslatorPlugin.moot.addRule(
  'あははっ情報ありがとう♪',          // aaa: 原文
  '谢谢情报',                              // bbb: AI 译文中的特征文本
  '啊哈哈 谢谢啦♪'                        // ccc: 替换结果
);

// 例2：正则匹配原文 + 正则过滤
MToolTranslatorPlugin.moot.addRule(
  '/\\d+日目/',                            // aaa: 匹配 "1日目"~"9日目"
  '/第\\d+天/',                            // bbb: AI 译文包含 "第N天"
  '第$1日'                                // ccc: 替换为 "第N日"
);

// 例3：仅做替换，不过滤（bbb = null）
MToolTranslatorPlugin.moot.addRule(
  '情報',                                 // aaa
  null,                                    // bbb: 不过滤
  '情报'                                   // ccc: 直接替换
);
```

---

## 支持的规则文件格式

### JSON 格式

```json
[
  {
    "aaa": "あははっ情報ありがとう♪",
    "bbb": "谢谢情报",
    "ccc": "啊哈哈 谢谢啦♪"
  },
  {
    "aaa": "/\\d+日目/",
    "bbb": "/第\\d+天/",
    "ccc": "第$1日"
  }
]
```

### CSV 格式（三列：aaa,bbb,ccc）

```csv
aaa,bbb,ccc
あははっ情報ありがとう♪,谢谢情报,啊哈哈 谢谢啦♪
/\d+日目/,/第\d+天/,第$1日
情報,,情报
```

### TSV 格式（三列，Tab 分隔）

```tsv
aaa	bbb	ccc
あははっ情報ありがとう♪	谢谢情报	啊哈哈 谢谢啦♪
```

### CollData.json 格式

```json
{
  "rule1": {
    "name": "通用修正",
    "transengine": "Bing",
    "data": [
      ["あははっ情報ありがとう♪", "谢谢情报", "啊哈哈 谢谢啦♪"],
      ["/\d+日目/", "/第\d+天/", "第$1日"]
    ]
  }
}
```

### 加载规则文件

```js
// UI：Moot 面板 → 「加载规则文件」按钮
// 或代码：
const file = document.getElementById('fileInput').files[0];
MToolTranslatorPlugin.moot.loadRules(file);
```

---

## API 参考

### MToolTranslatorPlugin.moot

| 方法 | 说明 |
|------|------|
| `.install(opts?)` | 安装 Hook（fetch + XHR 双管齐下） |
| `.autoInstall(opts?)` | 自动安装（带重试检测，适合启动时调用） |
| `.uninstall()` | 卸载 Hook，恢复原始 fetch/XHR |
| `.loadRules(file)` | 从文件加载后处理规则（JSON/CSV/TSV/XLSX） |
| `.addRule(aaa, bbb, ccc)` | 添加单条规则（bbb 可为 null） |
| `.clearRules()` | 清除所有后处理规则 |
| `.stats()` | 获取统计信息 |
| `.resetStats()` | 重置统计 |
| `.updateConfig(opts)` | 更新配置 |
| `.test(text)` | 手动测试翻译 |

### 统计字段

```js
MToolTranslatorPlugin.moot.stats();
// →
{
  enabled: true,
  installed: true,
  requestsSeen: 156,          // 见到的 Moot 请求总数
  requestsIntercepted: 42,     // 本地翻译命中，未发 AI 请求
  responsesSeen: 114,         // 见到的 AI 响应总数
  responsesFixed: 23,         // aiFixRules 成功修正的次数
  localHitRate: '26.9%'        // 本地命中率
}
```

---

## 配置项（config.ts）

| 配置键 | 默认值 | 说明 |
|--------|--------|------|
| `mootHookEnabled` | `true` | 是否自动安装 Moot Hook |
| `mootApiUrl` | `http://127.0.0.1:64002/wslikecmd` | Moot API 地址 |
| `mootInterceptRequest` | `true` | 请求阶段本地翻译拦截 |
| `mootProcessResponse` | `true` | 响应阶段 AI 译文后修正 |

---

## 与现有模块的协同

```
┌─────────────────────────────────────────────────────┐
│                   main.ts (安装入口)                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────┐    ┌──────────────┐              │
│  │  mootHook   │    │  wsHook      │              │
│  │  (HTTP POST)│    │  (WebSocket)│              │
│  └──────┬──────┘    └──────┬───────┘              │
│         │                     │                        │
│         │    ┌───────────────┐│                        │
│         └───▶│  aiFixRules  │◀┘                        │
│              │  (aaa/bbb/ccc)│                         │
│              └───────┬───────┘                         │
│                      │                                   │
│              ┌───────▼───────┐                           │
│              │   translator   │                           │
│              │ (本地规则引擎) │                           │
│              └───────────────┘                           │
└─────────────────────────────────────────────────────┘
```

- **mootHook**：拦截 HTTP POST 到 `wslikecmd`
- **wsHook**：拦截 WebSocket 到 `127.0.0.1:64002`
- **两者共用** `aiFixRules`（后修正引擎）和 `translator`（本地翻译）
- 覆盖 Moot 平台的两种通信方式，确保不漏

---

## 调试技巧

```js
// 1. 开启调试模式（控制台输出详细信息）
MToolTranslatorPlugin.moot.updateConfig({ debug: true });

// 2. 手动测试一条翻译
const result = await MToolTranslatorPlugin.moot.test('あははっ情報ありがとう♪');
console.log(result);

// 3. 查看统计
console.table(MToolTranslatorPlugin.moot.stats());

// 4. 查看所有后处理规则
console.log(MToolTranslatorPlugin.translator.getAIFixRules());
```

---

## 文件结构

```
src/
├── main.ts                     # 入口，安装所有 Hook
├── App.vue                     # 主面板 UI
├── config.ts                   # 全局配置
├── utils.ts                    # 工具函数（CSV/JSON 解析等）
├── core/
│   ├── translator.ts          # 本地翻译引擎（精确 + 正则 + Bloom + 预翻译）
│   ├── hook.ts                # 引擎 Hook（RPGMaker/Canvas/PixiJS 等）
│   ├── mootHook.ts           # ★ Moot HTTP Hook（本次新增核心）
│   ├── wsHook.ts             # Moot WebSocket Hook
│   ├── aiFixRules.ts         # aaa/bbb/ccc 后修正引擎
│   ├── aiTranslator.ts       # AI 翻译（OpenAI 兼容 API）
│   ├── cache.ts              # LRU 缓存
│   ├── logger.ts             # 日志系统
│   ├── bloomFilter.ts       # Bloom Filter 前置过滤
│   └── ruleCompactor.ts     # 规则压缩（相似规则→正则）
└── components/
    ├── MootPanel.vue         # ★ Moot Hook 管理面板（本次新增）
    ├── AIFixRules.vue        # AI 修正规则管理
    ├── Stats.vue              # 统计面板
    └── Icon.vue              # SVG 图标
```

---

## 注意事项

1. **Moot 平台必须先启动**，Hook 才能拦截到请求
2. **本地翻译优先**：命中本地规则时不会调用 AI，节省 API 费用
3. **后处理规则是兜底的**：即使 AI 翻译质量差，也能通过 ccc 修正关键术语
4. **正则规则注意转义**：JSON 中 `\d` 要写成 `\\d`
5. **Fetch 和 XHR 都已 Hook**：无论 Moot 用哪种方式发请求都能拦截
