# MTool 本地翻译插件 v0.1.0

高性能、多引擎、支持 AI 翻译回退的本地化翻译插件，专为游戏汉化/本地化场景设计。

## ✨ 特性

- **多引擎支持** — RPG Maker / PixiJS / Cocos2d-js / Canvas 2D / Bitmap / WebSocket / Fetch / XHR
- **多格式文件** — JSON / CSV / TSV / XLSX 导入导出，拖拽上传
- **AI 翻译回退** — 兼容 OpenAI / DeepSeek / 任何 OpenAI 兼容 API
- **高性能缓存** — 三级快速缓存 + LRU 淘汰 + 防抖持久化
- **实时统计** — 规则数、缓存命中率、AI 状态一目了然
- **TypeScript** — 全类型化，开发体验友好

## 📁 项目结构

```
src/
├── main.ts                  # 入口，自动初始化 + 全局 API
├── config.ts                # 类型化配置管理
├── utils.ts                 # 工具函数（文件解析、正则、防抖等）
├── App.vue                  # 主面板（可拖拽/折叠/Tab）
├── components/
│   ├── FileUpload.vue       # 拖拽上传 + 文件管理
│   ├── Settings.vue         # 设置面板（基本/引擎/AI）
│   ├── Logger.vue           # 增强日志（过滤/搜索/导出）
│   └── Stats.vue            # 实时统计面板
└── core/
    ├── translator.ts        # 核心翻译引擎
    ├── cache.ts             # 高性能缓存系统
    ├── hook.ts              # 多引擎 Hook 统一接口
    ├── logger.ts            # 响应式日志系统
    └── aiTranslator.ts      # AI 翻译模块
```

## 🚀 快速开始

### 1. 安装

将 `src/` 目录复制到你的项目中，确保构建工具（Vite/Webpack/Rollup）能处理 `.vue` 和 `.ts` 文件。

### 2. 引入

```html
<!-- 在你的游戏页面中引入 -->
<script src="path/to/MToolTranslatorPlugin.iife.js"></script>
```

或在模块中：

```javascript
import './src/main';
```

### 3. 使用

插件会自动初始化并挂载到页面右下角。点击 **「译」** 按钮打开面板。

## 📖 API 文档

通过 `window.MToolTranslatorPlugin` 访问全部功能：

```javascript
// 加载翻译文件
MTool.load('translations.json');
MTool.load(fileObject); // File 对象

// 导出翻译数据
MTool.export('json');  // 'json' | 'csv' | 'tsv'
MTool.export();         // 默认 json

// 查看统计
MTool.stats();
// → { rules: 1234, cacheSize: 567, cacheHitRate: 87.5, ... }

// 重置所有数据
MTool.reset();

// AI 翻译
MTool.testAI();
MTool.clearAICache();

// 日志
MTool.log('自定义消息', 'info'); // 'info' | 'success' | 'warning' | 'error'
```

## ⚙️ 配置说明

### 翻译文件格式

**JSON 格式（键值对）：**
```json
{
  "原文1": "译文1",
  "/正则模式/": "译文2",
  "常時ダッシュ": "保持冲刺状态"
}
```

**CSV/TSV 格式：**
```csv
source,target
常時ダッシュ,保持冲刺状态
ニューゲーム,开始游戏
```

**CollData.json 格式（MTool 社区格式）：**
```json
{
  "namespace": {
    "name": "常规通用性修正",
    "transengine": "Bing",
    "data": [
      ["原文", "译文"],
      ["/正则/", "译文"]
    ]
  }
}
```

### AI 翻译配置

在设置面板 → AI翻译 Tab 中填写：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| AI API Key | 你的 API 密钥 | `sk-xxxxxx` |
| AI Base URL | API 地址 | `https://api.deepseek.com` |
| 模型 | 模型名称 | `deepseek-chat` |
| 触发阈值 | 连续未命中多少条后触发 AI | `5` |

支持的 API：OpenAI、DeepSeek、智谱AI、Moonshot、任何 OpenAI 兼容接口。

## 🔧 引擎开关

在设置面板 → 引擎 Tab 中，可独立开关每个引擎 Hook：

- **RPG Maker** — MV/MZ 文本渲染
- **PixiJS** — PIXI.Text / BitmapText
- **Cocos2d-js** — cc.Label
- **Canvas 2D** — fillText / strokeText / measureText
- **Bitmap** — Bitmap.drawText
- **WebSocket / Fetch / XHR** — 网络层拦截

## 📊 性能优化

| 优化项 | 说明 |
|--------|------|
| 三级快速缓存 | 最近 3 条 O(1) 命中，无需哈希计算 |
| LRU 淘汰 | 热点数据保护，按访问频率排序 |
| 防抖持久化 | 缓存保存延迟 2s，减少 localStorage 写入 |
| 正则预排序 | 长规则优先匹配，减少无效遍历 |
| 忽略集合 | 已确认无需翻译的文本直接跳过 |
| 批量 AI 请求 | 多条文本合并为一次 API 调用 |
| 并发控制 | AI 请求最多 3 个并发，防止限流 |

## 📄 License

MIT