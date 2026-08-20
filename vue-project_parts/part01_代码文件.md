# 项目代码文件（第 1 部分）

> 本文件包含 8 个文件

---

## `src/App.vue`

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, defineAsyncComponent } from 'vue';
import translator from './core/translator';
import { scanRPGMakerDialog } from './core/hookManager';
import Icon, { type IconType } from './components/Icon.vue';

type Tab = 'files' | 'settings' | 'logs' | 'stats' | 'moot';
const show = ref(false);
const activeTab = ref<Tab>('files');
const panelWidth = ref(360);
const isDragging = ref(false);
const tabsItems: {
  key: Tab;
  label: string;
  icon: IconType
}[] = [
    { key: 'files', label: '文件', icon: 'folder' },
    { key: 'settings', label: '设置', icon: 'settings' },
    { key: 'stats', label: '统计', icon: 'chart' },
    { key: 'moot', label: 'Moot', icon: 'key' },
    { key: 'logs', label: '日志', icon: 'schedule' }
  ]


// ===== 优化新增状态 =====
const isPreTranslating = ref(false);
const compactResult = ref<any>(null);

const startDrag = () => {
  isDragging.value = true;
  document.body.style.cursor = 'ew-resize';
  const onMove = (ev: MouseEvent) => {
    if (!isDragging.value) return;
    const newWidth = window.innerWidth - ev.clientX;
    panelWidth.value = Math.max(280, Math.min(600, newWidth));
  };
  const onUp = () => {
    isDragging.value = false;
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
};

const toggle = () => { show.value = !show.value; };

onMounted(() => {
  // 安装 RPG Maker 文本扫描 + 预翻译触发
  setTimeout(() => {
    scanRPGMakerDialog((texts: Set<string>) => {
      // 扫描完成后，自动执行预翻译
      if (texts.size > 0 && translator.isPreTranslated() === false) {
        isPreTranslating.value = true;
        // 用 setTimeout 让 UI 有机会更新
        setTimeout(() => {
          try {
            translator.preTranslate(texts);
          } catch (e: any) {
            console.error('[MToolTranslatorPlugin] 预翻译失败:', e);
          } finally {
            isPreTranslating.value = false;
          }
        }, 0);
      }
    });
    translator.init();
  }, 500);
});

onUnmounted(() => {
  translator.destroy();
});

const stats = computed(() => translator.getStats());

// ===== 优化操作 =====

const runCompact = () => {
  try {
    compactResult.value = translator.compactRules(4);
  } catch (e: any) {
    console.error('[MToolTranslatorPlugin] 压缩失败:', e);
  }
};

const runPreTranslate = () => {
  if (typeof window.DataManager === 'undefined') {
    console.warn('[MToolTranslatorPlugin] DataManager 不可用');
    return;
  }
  // 强制重新扫描
  const allTexts = new Set<string>();
  // 遍历所有已加载的数据
  for (const key of Object.keys(window.$data || {})) {
    const data = window.$data[key];
    if (data) collectTexts(data, allTexts);
  }
  if (allTexts.size > 0) {
    isPreTranslating.value = true;
    setTimeout(() => {
      translator.preTranslate(allTexts);
      isPreTranslating.value = false;
    }, 0);
  }
};

/** 递归收集所有文本 */
function collectTexts(obj: any, set: Set<string>) {
  if (!obj) return;
  if (typeof obj === 'string') {
    if (obj.trim() && obj.length >= 2 && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(obj)) {
      set.add(obj.trim());
    }
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach(item => collectTexts(item, set));
    return;
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (obj.hasOwnProperty(key)) {
        collectTexts(obj[key], set);
      }
    }
  }
}
const components: Record<Tab, any> = {
  settings: defineAsyncComponent(() => import('./components/Settings.vue')),
  stats: defineAsyncComponent(() => import('./components/Stats.vue')),
  moot: defineAsyncComponent(() => import('./components/MootPanel.vue')),
  logs: defineAsyncComponent(() => import('./components/Logger.vue')),
  files: defineAsyncComponent(() => import('./components/FileUpload.vue')),
}
const Component = computed(() => components[activeTab.value]);

const keepAliveInclude = computed(() => Object.keys(components).join(','));
</script>

<template>
  <!-- 触发按钮 -->
  <div
    class="mtool-trigger"
    @click="toggle"
    :class="{ active: show }"
  >
    <span class="trigger-icon">译</span>
    <span
      class="trigger-badge"
      v-if="stats.rules > 0"
    >{{ stats.rules }}</span>
    <!-- 预翻译状态指示 -->
    <span
      class="trigger-badge pretrans"
      v-if="stats.preTranslated"
      title="预翻译已完成"
    >✓</span>
  </div>

  <!-- 主面板 -->
  <transition name="slide">
    <div
      v-show="show"
      class="mtool-panel transparent-glass"
      :style="{ width: panelWidth + 'px' }"
    >
      <!-- 拖拽条 -->
      <div
        class="mtool-resize-handle"
        @mousedown="startDrag"
      ></div>

      <!-- 标题栏 -->
      <div class="mtool-header">
        <span class="mtool-title">🛠 MTool 翻译引擎</span>
        <!-- 优化状态指示 -->
        <span
          class="optimize-badge"
          v-if="stats.preTranslated"
          title="预翻译已生效"
        >⚡预翻译</span>
        <div
          class="mtool-close"
          @click="toggle"
        >
          <Icon icon="close" />
        </div>
      </div>

      <!-- Tab 导航 -->
      <div class="mtool-tabs">
        <button
          v-for="tab in tabsItems"
          :key="tab.key"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          <Icon :icon="tab.icon" /> {{ tab.label }}
        </button>
      </div>

      <!-- Tab 内容 -->
      <div class="mtool-content">
        <KeepAlive :include="keepAliveInclude">
          <component :is="Component" />
        </KeepAlive>
      </div>

      <!-- 优化工具栏（底部） -->
      <div class="optimize-bar">
        <button
          class="opt-btn"
          @click="runCompact"
          title="将相似规则聚合为正则模板"
        >
          🗜 压缩规则
        </button>
        <button
          class="opt-btn"
          @click="runPreTranslate"
          title="重新扫描并预翻译所有文本"
        >
          ⚡ 预翻译
        </button>
        <span
          class="opt-status"
          v-if="isPreTranslating"
        >处理中...</span>
      </div>
    </div>
  </transition>
</template>

<style>
.mtool-trigger {
  position: fixed;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 64px;
  background: var(--accent-bg);
  border-radius: 0 10px 10px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10001;
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.15);
  transition: all 0.2s;
  user-select: none;
}

.mtool-trigger:hover {
  background: linear-gradient(180deg, #3395ff, #1a7dff);
  width: 36px;
}

button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: none;
}

button:hover {
  border-radius: 4px;
}

.mtool-trigger.active {
  opacity: 0;
  pointer-events: none;
}

.trigger-icon {
  color: #fff;
  font-size: 15px;
  font-weight: bold;
  writing-mode: vertical-rl;
}

.trigger-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ff4757;
  color: #fff;
  font-size: 10px;
  border-radius: 10px;
  padding: 1px 5px;
  min-width: 16px;
  text-align: center;
}

.trigger-badge.pretrans {
  top: auto;
  bottom: -4px;
  background: #2ecc71;
}

/* ========== 主面板 ========== */
.mtool-panel {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  background: #f8f9fa;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
  border-left: 1px solid #e0e0e0;
}

.mtool-resize-handle {
  position: absolute;
  left: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 10;
}

.mtool-resize-handle:hover {
  background: rgba(25, 125, 234, 0.2);
}

/* ========== 头部 ========== */
.mtool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(135deg, #197dea, #1559b3);
  color: #fff;
}

.mtool-title {
  font-weight: bold;
  font-size: 15px;
}

.optimize-badge {
  background: rgba(46, 204, 113, 0.9);
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
}

.mtool-close {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: #fff;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.mtool-close:hover {
  background: rgba(255, 255, 255, 0.35);
}

/* ========== Tabs ========== */
.mtool-tabs {
  display: flex;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  padding: 0 4px;
}

.mtool-tabs button {
  flex: 1;
  padding: 10px 2px;
  border: none;
  background: none;
  font-size: 11px;
  cursor: pointer;
  color: #666;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  white-space: nowrap;
}

.mtool-tabs button:hover {
  color: #197dea;
  background: #f0f7ff;
}

.mtool-tabs button.active {
  color: #197dea;
  border-bottom-color: #197dea;
  font-weight: bold;
}

/* ========== 内容区 ========== */
.mtool-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.mtool-tabs,
.mtool-content {
  background: var(--accent-bg);
}

/* ========== 动画 ========== */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}

/* ========== 滚动条美化 ========== */
.mtool-content::-webkit-scrollbar {
  width: 6px;
}

.mtool-content::-webkit-scrollbar-track {
  background: transparent;
}

.mtool-content::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.mtool-content::-webkit-scrollbar-thumb:hover {
  background: #999;
}

/* ========== 优化工具栏 ========== */
.optimize-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #f0f4f8;
  border-top: 1px solid #e0e0e0;
}

.opt-btn {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #197dea;
  background: #fff;
  color: #197dea;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.opt-btn:hover {
  background: #197dea;
  color: #fff;
}

.opt-status {
  font-size: 10px;
  color: #f39c12;
  white-space: nowrap;
}
</style>

```

## `src/components/AIFixRules.vue`

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import translator from '../core/translator';
import logger, { LogLevel } from '../core/logger';
import Icon from './Icon.vue';
import { download } from '../utils';

const fileInput = ref<HTMLInputElement | null>(null);
const newAaa = ref('');
const newBbb = ref('');
const newCcc = ref('');
const isRegex = ref(false);
const rules = computed(() => translator.getAIFixRules());

const triggerUpload = () => {
  fileInput.value?.click();
};

const handleFile = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  await translator.loadAIFixRules(file);
  input.value = '';
};

const addRule = () => {
  if (!newAaa.value.trim() || !newBbb.value.trim()) {
    logger.addLog('aaa 和 bbb 不能为空', LogLevel.WARNING);
    return;
  }

  let aaa: string | RegExp = newAaa.value.trim();
  let bbb: string | RegExp = newBbb.value.trim();

  if (isRegex.value) {
    try {
      const m1 = aaa.match(/^\/(.+)\/([gimsuy]*)$/);
      if (m1) aaa = new RegExp(m1[1], m1[2] || 'g');
      const m2 = bbb.match(/^\/(.+)\/([gimsuy]*)$/);
      if (m2) bbb = new RegExp(m2[1], m2[2] || 'g');
    } catch (e: any) {
      logger.addLog(`正则解析失败: ${e.message}`, LogLevel.ERROR);
      return;
    }
  }

  translator.addAIFixRule(aaa, bbb, newCcc.value);
  newAaa.value = '';
  newBbb.value = '';
  newCcc.value = '';
  logger.addLog('AI 修正规则已添加', LogLevel.SUCCESS);
};

const removeRule = (index: number) => {
  const all = translator.getAIFixRules();
  translator.clearAIFixRules();
  all.forEach((r: any, i: number) => {
    if (i !== index) translator.addAIFixRule(r.aaa, r.bbb, r.ccc);
  });
};

const exportJSON = async () => {
  const { data, fileName } = translator.exportAIFixRules('json');
  await download(data, fileName, 'json');
};

const exportCSV = async () => {
  const { data, fileName } = translator.exportAIFixRules('csv');
  await download(data, fileName, 'csv');
};

const clearAll = () => {
  if (confirm('确定清空所有 AI 修正规则？')) {
    translator.clearAIFixRules();
  }
};

const formatPattern = (val: any): string => {
  if (val instanceof RegExp) return `/${val.source}/${val.flags}`;
  return String(val || '');
};

const fileType = computed(() => {
  return ['json', 'csv', 'tsv', 'xlsx', 'xls'].map(type => `.${type}`).join(',');
});
</script>

<template>
  <div class="ai-fix-panel">
    <!-- 说明 -->
    <div class="ai-fix-info">
      <p>AI 翻译后修正规则：原文匹配 <code>aaa</code> 且 AI 译文包含 <code>bbb</code> 时，替换为 <code>ccc</code></p>
    </div>

    <!-- 上传区域 -->
    <div class="upload-section">
      <button
        class="upload-btn"
        @click="triggerUpload"
      >
        <Icon icon="upload" /> 加载规则文件 (JSON/CSV/TSV/XLSX)
      </button>
      <input
        ref="fileInput"
        type="file"
        :accept="fileType"
        style="display:none"
        @change="handleFile"
      />
      <div class="export-btns">
        <button
          class="exp-btn"
          @click="exportJSON"
        >导出JSON</button>
        <button
          class="exp-btn"
          @click="exportCSV"
        >导出CSV</button>
        <button
          class="exp-btn danger"
          @click="clearAll"
        >清空</button>
      </div>
    </div>

    <!-- 手动添加 -->
    <div class="add-section">
      <div class="section-title">➕ 手动添加规则</div>
      <div class="form-row">
        <label>aaa (原文/正则):</label>
        <input
          v-model="newAaa"
          placeholder='原文或 /正则/'
          class="form-input"
        />
      </div>
      <div class="form-row">
        <label>bbb (AI译文匹配):</label>
        <input
          v-model="newBbb"
          placeholder='AI译文中需包含的文本或 /正则/'
          class="form-input"
        />
      </div>
      <div class="form-row">
        <label>ccc (替换结果):</label>
        <input
          v-model="newCcc"
          placeholder='替换后的文本'
          class="form-input"
        />
      </div>
      <div class="form-row checkbox-row">
        <label>
          <input
            type="checkbox"
            v-model="isRegex"
          />
          使用正则表达式
        </label>
        <button
          class="add-btn"
          @click="addRule"
        >添加规则</button>
      </div>
    </div>

    <!-- 规则列表 -->
    <div class="rules-section">
      <div class="section-title">
        📋 规则列表 ({{ rules.length }} 条)
      </div>
      <div
        class="rules-list"
        v-if="rules.length > 0"
      >
        <div
          v-for="(rule, idx) in rules"
          :key="idx"
          class="rule-card"
        >
          <div class="rule-header">
            <span class="rule-index">#{{ idx + 1 }}</span>
            <span
              class="rule-type"
              :class="{ regex: rule._isRegex }"
            >
              {{ rule._isRegex ? '🔧 正则' : '📝 精确' }}
            </span>
            <button
              class="rule-del"
              @click="removeRule(idx)"
            >✕</button>
          </div>
          <div class="rule-body">
            <div class="rule-row">
              <span class="rule-label">aaa:</span>
              <span class="rule-value aaa">{{ formatPattern(rule.aaa) }}</span>
            </div>
            <div class="rule-row">
              <span class="rule-label">bbb:</span>
              <span class="rule-value bbb">{{ formatPattern(rule.bbb) }}</span>
            </div>
            <div class="rule-row">
              <span class="rule-label">ccc:</span>
              <span class="rule-value ccc">{{ rule.ccc }}</span>
            </div>
          </div>
        </div>
      </div>
      <div
        class="empty-state"
        v-else
      >
        <p>暂无规则，请上传文件或手动添加</p>
        <p class="hint">支持格式：JSON [{aaa,bbb,ccc}] / CSV(三列) / CollData.json</p>
      </div>
    </div>

    <!-- 匹配流程说明 -->
    <div class="flow-section">
      <div class="section-title">🔄 匹配流程</div>
      <div class="flow-diagram">
        <div class="flow-step">原文<br /><small>あははっ情報ありがとう♪</small></div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">MTool AI<br /><small>啊哈哈 谢谢情报♪</small></div>
        <div class="flow-arrow">→</div>
        <div class="flow-step fix">aiFixRules<br /><small>检查 aaa+bbb → 替换 ccc</small></div>
        <div class="flow-arrow">→</div>
        <div class="flow-step final">最终文本<br /><small>交给游戏引擎</small></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-fix-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-fix-info {
  background: #f0e6ff;
  border: 1px solid #d4b5ff;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 11px;
  color: #6a3fa0;
  line-height: 1.5;
}

.ai-fix-info code {
  background: #e8d5ff;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: monospace;
}

/* ===== 上传区域 ===== */
.upload-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.upload-btn {
  padding: 10px;
  background: linear-gradient(135deg, #9b59b6, #8e44ad);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(155, 89, 182, 0.4);
}

.export-btns {
  display: flex;
  gap: 6px;
}

.exp-btn {
  flex: 1;
  padding: 6px;
  border: 1px solid #9b59b6;
  background: #fff;
  color: #9b59b6;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.exp-btn:hover {
  background: #9b59b6;
  color: #fff;
}

.exp-btn.danger {
  border-color: #e74c3c;
  color: #e74c3c;
}

.exp-btn.danger:hover {
  background: #e74c3c;
  color: #fff;
}

/* ===== 手动添加 ===== */
.add-section {
  background: #faf8ff;
  border: 1px solid #e8d5ff;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-title {
  font-size: 12px;
  font-weight: bold;
  color: #555;
  padding-bottom: 4px;
  border-bottom: 1px solid #eee;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.form-row label {
  font-size: 11px;
  color: #666;
  min-width: 100px;
  flex-shrink: 0;
}

.form-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: #9b59b6;
}

.checkbox-row {
  justify-content: space-between;
  margin-top: 4px;
}

.checkbox-row label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  cursor: pointer;
}

.add-btn {
  padding: 6px 16px;
  background: #9b59b6;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.add-btn:hover {
  background: #8e44ad;
}

/* ===== 规则列表 ===== */
.rules-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rules-list {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rule-card {
  background: #fff;
  border: 1px solid #e8d5ff;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
}

.rule-card:hover {
  box-shadow: 0 2px 8px rgba(155, 89, 182, 0.15);
}

.rule-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #f5f0ff;
  border-bottom: 1px solid #e8d5ff;
}

.rule-index {
  font-size: 10px;
  color: #999;
  font-weight: bold;
}

.rule-type {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: #e8f4fd;
  color: #197dea;
}

.rule-type.regex {
  background: #fff3cd;
  color: #f39c12;
}

.rule-del {
  margin-left: auto;
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  color: #999;
  cursor: pointer;
  font-size: 14px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rule-del:hover {
  background: #fee;
  color: #e74c3c;
}

.rule-body {
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rule-row {
  display: flex;
  gap: 4px;
  font-size: 11px;
  line-height: 1.4;
}

.rule-label {
  color: #999;
  min-width: 30px;
  flex-shrink: 0;
}

.rule-value {
  color: #333;
  word-break: break-all;
  font-family: monospace;
  font-size: 10.5px;
}

.rule-value.aaa {
  color: #197dea;
}

.rule-value.bbb {
  color: #f39c12;
}

.rule-value.ccc {
  color: #2ecc71;
  font-weight: bold;
}

.empty-state {
  text-align: center;
  padding: 20px;
  color: #999;
  font-size: 12px;
}

.empty-state .hint {
  font-size: 10px;
  color: #bbb;
}

/* ===== 流程图 ===== */
.flow-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 10px;
}

.flow-diagram {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.flow-step {
  flex-shrink: 0;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 10px;
  text-align: center;
  min-width: 70px;
  line-height: 1.3;
}

.flow-step small {
  display: block;
  color: #999;
  font-size: 9px;
  margin-top: 2px;
}

.flow-step.fix {
  border-color: #9b59b6;
  background: #f5f0ff;
  color: #6a3fa0;
  font-weight: bold;
}

.flow-step.final {
  border-color: #2ecc71;
  background: #e8f8f0;
  color: #27ae60;
  font-weight: bold;
}

.flow-arrow {
  color: #999;
  font-size: 14px;
  flex-shrink: 0;
}
</style>

```

## `src/components/FileUpload.vue`

```vue
<script setup lang="ts">
import { ref } from 'vue';
import translator from '../core/translator';
import logger, { LogLevel } from '../core/logger';
import config from '../config';
import { isSupportedFileType, getFileType } from '../utils';
import Icon from './Icon.vue';

const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const dragOver = ref(false);

const triggerFileSelect = () => fileInput.value?.click();

const onFileSelected = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  await processFile(file);
  target.value = '';
};

const onDrop = async (e: DragEvent) => {
  e.preventDefault();
  dragOver.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) await processFile(file);
};

const processFile = async (file: File) => {
  if (!isSupportedFileType(file.name)) {
    logger.addLog(`不支持的文件格式: .${getFileType(file.name)}`, LogLevel.ERROR);
    return;
  }

  uploading.value = true;
  try {
    const success = await translator.loadFromFile(file);
    if (success) {
      config.user.fileName.userConfig = file.name;
      logger.addLog(`文件加载成功: ${file.name}`, LogLevel.SUCCESS);
    }
  } finally {
    uploading.value = false;
  }
};

const onDragOver = (e: DragEvent) => {
  e.preventDefault();
  dragOver.value = true;
};

const onDragLeave = () => {
  dragOver.value = false;
};
</script>

<template>
  <div class="upload-panel">
    <!-- 拖拽区域 -->
    <div
      class="drop-zone"
      :class="{ 'drag-over': dragOver, 'uploading': uploading }"
      @click="triggerFileSelect"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
    >
      <div
        v-if="!uploading"
        class="drop-content"
      >
        <div class="drop-icon">
          <Icon
            icon="upload"
            :size="28"
          />
        </div>
        <div class="drop-text">
          <strong>点击或拖拽文件到此处</strong>
          <p>支持 JSON / CSV / TSV / XLSX 格式</p>
        </div>
      </div>
      <div
        v-else
        class="drop-content uploading-content"
      >
        <div class="spinner"></div>
        <span>正在加载文件...</span>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".json,.csv,.tsv,.xlsx,.xls"
      style="display: none"
      @change="onFileSelected"
    >

    <!-- 当前文件信息 -->
    <div class="current-file">
      <span class="label">当前文件:</span>
      <span class="filename">{{ config.user.fileName.userConfig }}</span>
    </div>

    <!-- 提示 -->
    <div class="hint">
      <p>📌 文件格式说明：</p>
      <ul>
        <li><b>JSON:</b> {"原文": "译文"} 或 [["原文","译文"]]</li>
        <li><b>CSV/TSV:</b> 两列，第一列原文，第二列译文</li>
        <li><b>XLSX:</b> 第一行表头，后续行列A=原文，列B=译文</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.upload-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 拖拽区域 */
.drop-zone {
  border: 2px dashed #b0c4de;
  border-radius: 10px;
  padding: 24px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  background: #f0f8ff;
}

.drop-zone:hover {
  border-color: #197dea;
  background: #e8f4fd;
}

.drop-zone.drag-over {
  border-color: #2ecc71;
  background: #e8f8f0;
}

.drop-zone.uploading {
  cursor: wait;
  opacity: 0.7;
}

.drop-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.drop-icon {
  color: #197dea;
  opacity: 0.7;
}

.drop-text strong {
  font-size: 13px;
  color: #333;
}

.drop-text p {
  font-size: 10px;
  color: #999;
  margin: 2px 0 0 0;
}

.uploading-content {
  flex-direction: row;
  gap: 10px;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 3px solid #ddd;
  border-top-color: #197dea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 当前文件 */
.current-file {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 4px 8px;
  background: #f8f9fa;
  border-radius: 6px;
}

.current-file .label {
  color: #888;
}

.current-file .filename {
  color: #197dea;
  font-weight: 500;
  word-break: break-all;
}

/* 提示 */
.hint {
  font-size: 10px;
  color: #888;
  background: #f8f9fa;
  border-radius: 6px;
  padding: 8px 10px;
}

.hint p {
  margin: 0 0 4px 0;
  font-weight: 500;
}

.hint ul {
  margin: 0;
  padding-left: 16px;
}

.hint li {
  margin: 1px 0;
  line-height: 1.5;
}
</style>
```

## `src/components/Icon.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue';

export type IconType =
  'none'
  | 'text'
  | 'sound'
  | 'history'
  | 'close'
  | 'schedule'
  | 'volume'
  | 'settings'
  | "url"
  | "key"
  | "delete"
  | "chart"
  | "search"
  | "upload"
  | "download"
  | "folder"
  | "loadfolder";

const props = defineProps({
  icon: {
    type: String as () => IconType,
    default: ''
  },
  size: {
    type: Number,
    default: 16
  }
});

const svgHtml: Record<IconType, string> = {
  none: '',
  loadfolder: '<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 8C5 6.89543 5.89543 6 7 6H19L24 12H41C42.1046 12 43 12.8954 43 14V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V8Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/><path d="M43 22H5" stroke="#333" stroke-width="4" stroke-linejoin="round"/><path d="M5 16V28" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M43 16V28" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  folder: '<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 8C5 6.89543 5.89543 6 7 6H19L24 12H41C42.1046 12 43 12.8954 43 14V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V8Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/><path d="M18 27H30" stroke="#333" stroke-width="4" stroke-linecap="round"/><path d="M24 21L24 33" stroke="#333" stroke-width="4" stroke-linecap="round"/></svg>',
  url: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
  key: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-key" aria-hidden="true"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"></path><path d="m21 2-9.6 9.6"></path><circle cx="7.5" cy="15.5" r="5.5"></circle></svg>`,
  settings: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 4L18 10H10V18L4 24L10 30V38H18L24 44L30 38H38V30L44 24L38 18V10H30L24 4Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/><path d="M24 30C27.3137 30 30 27.3137 30 24C30 20.6863 27.3137 18 24 18C20.6863 18 18 20.6863 18 24C18 27.3137 20.6863 30 24 30Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/></svg>`,
  text: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>`,
  sound: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10v3M6 7v9M10 4v15M14 7v9M18 10v3"/></svg>`,
  history: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-history-icon lucide-history"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
  upload: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 44H38C39.1046 44 40 43.1046 40 42V14H30V4H10C8.89543 4 8 4.89543 8 6V42C8 43.1046 8.89543 44 10 44Z" fill="none" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 4L40 14" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 21V35" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 28H24L31 28" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  download: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 24.0083V42H42V24" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M33 23L24 32L15 23" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M23.9917 6V32" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  schedule: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clipboard-list-icon lucide-clipboard-list"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>`,
  volume: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume2-icon lucide-volume-2"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/></svg>`,
  delete: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  search: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 38C30.3888 38 38 30.3888 38 21C38 11.6112 30.3888 4 21 4C11.6112 4 4 11.6112 4 21C4 30.3888 11.6112 38 21 38Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/><path d="M26.657 14.3431C25.2093 12.8954 23.2093 12 21.0001 12C18.791 12 16.791 12.8954 15.3433 14.3431" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M33.2216 33.2217L41.7069 41.707" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chart: `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="8" width="40" height="32" rx="2" fill="none" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 25V32" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 16V32" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 20V32" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

const svg = computed(() => {
  return svgHtml[props.icon as IconType];
});
</script>

<template>
  <span
    v-html="svg"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
  ></span>
</template>

<style scoped>
span {
  display: inline-flex;
  min-width: 12px;
  min-height: 12px;
}

span :deep(svg) {
  fill: none;
  width: 100%;
  height: 100%;
  stroke: currentColor;
  min-width: 12px;
  min-height: 12px;
}
</style>
```

## `src/components/Logger.vue`

```vue
<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import logger, { type LogFilter, type LogEntry, LogLevel } from '../core/logger';
import Icon from './Icon.vue';

const logs = logger.log_queue;
const filter = ref<LogFilter>('all');
const searchText = ref('');
const autoScroll = ref(true);
const containerRef = ref<HTMLDivElement | null>(null);

const filteredLogs = computed(() => {
  let result = logs;
  if (filter.value !== 'all') {
    result = result.filter((l: LogEntry) => l.level === filter.value);
  }
  if (searchText.value.trim()) {
    const q = searchText.value.toLowerCase();
    result = result.filter((l: LogEntry) => l.text.toLowerCase().includes(q));
  }
  return result;
});

const stats = computed(() => logger.getStats());

const clearLogs = () => logger.clearLog();


watch(filteredLogs, async () => {
  if (!autoScroll.value) return;
  await nextTick();
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight;
  }
}, { deep: true });
</script>

<template>
  <div class="logger">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="filter-group">
        <button
          :class="{ active: filter === 'all' }"
          @click="filter = 'all'"
        >全部({{ stats.total }})</button>
        <button
          class="info"
          :class="{ active: filter === LogLevel.INFO }"
          @click="filter = LogLevel.INFO"
        >信息</button>
        <button
          class="success"
          :class="{ active: filter === LogLevel.SUCCESS }"
          @click="filter = LogLevel.SUCCESS"
        >成功</button>
        <button
          class="warning"
          :class="{ active: filter === LogLevel.WARNING }"
          @click="filter = LogLevel.WARNING"
        >警告</button>
        <button
          class="error"
          :class="{ active: filter === LogLevel.ERROR }"
          @click="filter = LogLevel.ERROR"
        >错误</button>
      </div>
      <div class="toolbar-right">
        <div style="display: flex; align-items: center; gap: 4px;">
          <Icon
            :size="16"
            icon="search"
          />
          <input
            class="search"
            type="text"
            v-model="searchText"
            placeholder="搜索..."
          />
        </div>

        <label class="autoscroll">
          <input
            type="checkbox"
            v-model="autoScroll"
          > 自动滚动
        </label>
        <button
          class="clear-btn"
          @click="clearLogs"
          title="清空日志"
        >
          <Icon
            :size="16"
            icon="delete"
          />
        </button>
      </div>
    </div>

    <!-- 日志列表 -->
    <div
      class="log-container"
      ref="containerRef"
    >
      <div
        v-if="filteredLogs.length === 0"
        class="empty"
      >暂无日志</div>
      <div
        v-for="log in filteredLogs"
        :key="log.id"
        :class="['log-item', log.level]"
      >
        <span class="log-icon">
          <template v-if="log.level === 'info'">ℹ️</template>
          <template v-else-if="log.level === 'success'">✅</template>
          <template v-else-if="log.level === 'warning'">⚠️</template>
          <template v-else-if="log.level === 'error'">❌</template>
          <template v-else>🔍</template>
        </span>
        <span class="log-text">{{ log.text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.logger {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
}

/* ===== 工具栏 ===== */
.toolbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-group {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}

.filter-group button {
  padding: 3px 8px;
  border: 1px solid #e0e0e0;
  background: #fff;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  color: #666;
  transition: all 0.15s;
}

.filter-group button:hover {
  background: #f0f7ff;
}

.filter-group button.active {
  background: #197dea;
  color: #fff;
  border-color: #197dea;
}

.toolbar-right {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.search {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 11px;
  outline: none;
}

.search:focus {
  border-color: #197dea;
}

.autoscroll {
  font-size: 10px;
  color: #666;
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  cursor: pointer;
}

.clear-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
}

.clear-btn:hover {
  background: #f0f0f0;
}

/* ===== 日志容器 ===== */
.log-container {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 4px;
}

.log-container::-webkit-scrollbar {
  width: 4px;
}

.log-container::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 2px;
}

.empty {
  text-align: center;
  color: #bbb;
  font-size: 12px;
  padding: 20px 0;
}

/* ===== 日志条目 ===== */
.log-item {
  border-radius: 4px;
  font-weight: 500;
  font-size: 16px;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.4;
  word-break: break-all;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
  }
}

.log-icon {
  flex-shrink: 0;
  font-size: 11px;
}

.log-text {
  color: #333;
}

.log-item.info {
  background: #e8f4fd;
}

.log-item.success {
  background: #e8f8f0;
}

.log-item.warning {
  background: #fdf6e3;
}

.log-item.error {
  background: #fdf0f0;
}
</style>
```

## `src/components/MootPanel.vue`

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import mootHook from '../core/mootHook';
import translator from '../core/translator';
import logger, { LogLevel } from '../core/logger';
import Icon from './Icon.vue';
import config from '../config';

const stats = ref({
  enabled: config.user.mootHookEnabled.userConfig,
  installed: false,
  requestsSeen: 0,
  requestsIntercepted: 0,
  responsesSeen: 0,
  responsesFixed: 0,
  responsesLearned: 0,
  cacheHitRate: '0%',
});
const aaaInput = ref('');
const bbbInput = ref('');
const cccInput = ref('');
const ruleFileInput = ref<HTMLInputElement | null>(null);

const toggleEnabled = () => {
  if (config.user.mootHookEnabled.userConfig) {
    mootHook.uninstall();
    config.user.mootHookEnabled.userConfig = false;
    logger.addLog('[Moot] Hook 已禁用', LogLevel.WARNING);
  } else {
    mootHook.install({
      apiUrl: config.user.mootApiUrl.userConfig,
      interceptRequest: true,
      processResponse: true,
      debug: config.user.mootDebug.userConfig,
    });
    config.user.mootHookEnabled.userConfig = true;
    refreshStats();
    logger.addLog('[Moot] Hook 已启用', LogLevel.SUCCESS);
  }
};

const refreshStats = () => {
  stats.value = mootHook.getStats();
};

const addRule = () => {
  const aaa = aaaInput.value.trim();
  const ccc = cccInput.value.trim();
  if (!aaa || !ccc) {
    logger.addLog('[Moot] aaa 和 ccc 不能为空', LogLevel.WARNING);
    return;
  }
  const bbb = bbbInput.value.trim() || null;
  mootHook.addRule(aaa, bbb, ccc);
  aaaInput.value = '';
  bbbInput.value = '';
  cccInput.value = '';
  refreshStats();
  logger.addLog(`[Moot] 规则已添加: "${aaa}" → "${ccc}"`, LogLevel.SUCCESS);
};

const clearRules = () => {
  if (!confirm('确定要清除所有后处理规则吗？')) return;
  mootHook.clearRules();
  refreshStats();
  logger.addLog('[Moot] 所有后处理规则已清除', LogLevel.WARNING);
};

const triggerFileUpload = () => ruleFileInput.value?.click();

const onRuleFileSelect = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  try {
    const count = await mootHook.loadRulesFromFile(file);
    refreshStats();
    logger.addLog(`[Moot] 规则文件加载成功: ${file.name}（${count} 条）`, LogLevel.SUCCESS);
  } catch (err: any) {
    logger.addLog(`[Moot] 规则文件加载失败: ${err.message}`, LogLevel.ERROR);
  }
  target.value = '';
};

const testText = ref('あははっ情報ありがとう♪');
const testResult = ref('');
const testLoading = ref(false);

const runTest = async () => {
  if (!config.user.mootHookEnabled.userConfig) {
    logger.addLog('[Moot] 请先启用 Hook', LogLevel.WARNING);
    return;
  }
  testLoading.value = true;
  try {
    const result = await mootHook.testTranslate(testText.value);
    testResult.value = result;
    refreshStats();
  } catch (err: any) {
    testResult.value = `错误: ${err.message}`;
  } finally {
    testLoading.value = false;
  }
};

const resetStats = () => {
  mootHook.resetStats();
  refreshStats();
  logger.addLog('[Moot] 统计已重置', LogLevel.INFO);
};

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  timer = setInterval(() => {
    if (config.user.mootHookEnabled.userConfig) refreshStats();
  }, 2000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

// ===== 计算属性 =====

const statusValue = computed(() => {
  return config.user.mootHookEnabled.userConfig ? '✅ 运行中' : '⏸ 已停止';
});

const learnedCount = computed(() => {
  // 从 translator 的全局统计中获取
  const s = translator.getStats();
  return s.aiLearnedCount || 0;
});

const totalCacheSize = computed(() => {
  const s = translator.getStats();
  return s.cacheSize || 0;
});

const cacheIntegrationRate = computed(() => {
  const total = stats.value.responsesSeen;
  if (total === 0) return '0%';
  const learned = stats.value.responsesLearned;
  return ((learned / total) * 100).toFixed(1) + '%';
});

const statusCardClass = computed(() => {
  return {
    active: config.user.mootHookEnabled.userConfig,
  };
});
</script>

<template>
  <div class="moot-panel">
    <!-- 启用开关 -->
    <div class="moot-header">
      <div class="moot-title">
        <span>Moot 平台 AI 翻译 Hook</span>
      </div>
      <label class="moot-switch">
        <input
          type="checkbox"
          :checked="config.user.mootHookEnabled.userConfig"
          @change="toggleEnabled"
        >
        <span class="slider"></span>
      </label>
    </div>

    <!-- 状态卡片 -->
    <div class="status-grid">
      <div
        class="status-card"
        :class="statusCardClass"
      >
        <div class="status-label">状态</div>
        <div class="status-value">{{ statusValue }}</div>
      </div>
      <div class="status-card blue">
        <div class="status-label">请求拦截</div>
        <div class="status-value">{{ stats.requestsIntercepted }}</div>
      </div>
      <div class="status-card green">
        <div class="status-label">AI修正</div>
        <div class="status-value">{{ stats.responsesFixed }}</div>
      </div>
      <div class="status-card purple">
        <div class="status-label">已学入缓存</div>
        <div class="status-value">{{ stats.responsesLearned }}</div>
      </div>
    </div>

    <!-- ★ 缓存集成状态（核心展示）★ -->
    <div class="cache-integration-bar">
      <div class="ci-title">📦 主缓存集成状态</div>
      <div class="ci-stats">
        <div class="ci-item">
          <span class="ci-label">主缓存总量</span>
          <span class="ci-value">{{ totalCacheSize }}</span>
        </div>
        <div class="ci-item">
          <span class="ci-label">AI贡献条目</span>
          <span class="ci-value ai">{{ learnedCount }}</span>
        </div>
        <div class="ci-item">
          <span class="ci-label">缓存写入率</span>
          <span class="ci-value">{{ cacheIntegrationRate }}</span>
        </div>
      </div>
      <div class="ci-note">
        AI 翻译结果自动写入主缓存 → 下次相同文本直接命中 → 导出时随主缓存一起输出
      </div>
    </div>

    <!-- API 地址 -->
    <div class="form-section">
      <div style="display: flex; align-items: center;gap: 4px;">
        <Icon
          icon="url"
          :size="12"
        />
        <label class="form-label">Moot API 地址</label>
      </div>

      <input
        v-model="config.user.mootApiUrl.userConfig"
        type="text"
        class="form-input"
        placeholder="http://127.0.0.1:64002/wslikecmd"
        :disabled="config.user.mootHookEnabled.userConfig"
      >
      <div class="form-hint">启用后不可修改，需先禁用再改</div>
    </div>

    <!-- 调试模式 -->
    <div class="form-section">
      <label class="checkbox-label">
        <input
          v-model="config.user.mootDebug.userConfig"
          type="checkbox"
          :disabled="config.user.mootHookEnabled.userConfig"
        >
        <span>调试模式（控制台输出详细信息）</span>
      </label>
    </div>

    <!-- 后处理规则管理 -->
    <div class="section-title">📋 后处理规则 (aaa / bbb / ccc)</div>

    <div class="rule-form">
      <div class="form-row">
        <label class="form-label">aaa（原文/正则）</label>
        <input
          v-model="aaaInput"
          type="text"
          class="form-input"
          placeholder="例: あははっ情報ありがとう"
        >
      </div>
      <div class="form-row">
        <label class="form-label">bbb（AI译文需包含，可选）</label>
        <input
          v-model="bbbInput"
          type="text"
          class="form-input"
          placeholder="例: 谢谢 (留空=不过滤)"
        >
      </div>
      <div class="form-row">
        <label class="form-label">ccc（替换结果）</label>
        <input
          v-model="cccInput"
          type="text"
          class="form-input"
          placeholder="例: 啊哈哈 谢谢啦♪"
        >
      </div>
      <button
        class="btn-add"
        @click="addRule"
      >
        <Icon icon="upload" /> 添加规则
      </button>
    </div>

    <!-- 文件上传 -->
    <div class="rule-file-section">
      <button
        class="btn-upload"
        @click="triggerFileUpload"
      >
        <Icon icon="folder" /> 加载规则文件
      </button>
      <span class="file-hint">支持 .json / .csv / .tsv（三列格式）</span>
      <input
        ref="ruleFileInput"
        type="file"
        accept=".json,.csv,.tsv,.xlsx,.xls"
        style="display: none"
        @change="onRuleFileSelect"
      >
    </div>

    <!-- 规则说明 -->
    <div class="rule-explanation">
      <div class="expl-title">工作流程</div>
      <div class="expl-body">
        <p><b>① 请求阶段：</b></p>
        <p class="code-line">POST {cmd:"trs", args:[原文]}</p>
        <p>→ 查<b>主缓存</b>（含 AI 已学条目）</p>
        <p>→ 命中 → 直接返回，<b>跳过 AI</b> ✅</p>
        <p style="margin-top:6px;"><b>② 响应阶段：</b></p>
        <p>→ AI 译文 → <b>aiFixRules.fix()</b> 修正</p>
        <p>→ 修正结果 → <b>写入主缓存</b> ✅</p>
        <p>→ 下次同文本 → <b>100% 缓存命中</b></p>
      </div>
    </div>

    <!-- 缓存集成说明 -->
    <div class="cache-flow">
      <div class="expl-title">📦 缓存集成</div>
      <div class="expl-body">
        <p>AI 翻译结果 → <b>cache.set(原文, 译文)</b></p>
        <p>下次请求 → <b>cache.get(原文)</b> → 命中 → 跳过网络</p>
        <p>导出翻译 → 主缓存 + AI 条目 → <b>合并输出</b></p>
        <p class="highlight">无需单独导出，一切走主缓存系统</p>
      </div>
    </div>

    <!-- 测试区域 -->
    <div class="section-title">🧪 测试</div>
    <div class="test-section">
      <div class="form-row">
        <input
          v-model="testText"
          type="text"
          class="form-input"
          placeholder="输入日文测试文本"
        >
        <button
          class="btn-test"
          @click="runTest"
          :disabled="testLoading"
        >
          {{ testLoading ? '请求中...' : '发送测试' }}
        </button>
      </div>
      <div
        v-if="testResult"
        class="test-result-box"
      >
        <div class="test-label">返回结果：</div>
        <pre class="test-result">{{ testResult }}</pre>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="moot-actions">
      <button
        class="btn-clear"
        @click="clearRules"
      >
        <Icon icon="delete" /> 清除规则
      </button>
      <button
        class="btn-refresh"
        @click="refreshStats"
      >
        <Icon icon="history" /> 刷新统计
      </button>
      <button
        class="btn-reset"
        @click="resetStats"
      >
        重置统计
      </button>
    </div>
  </div>
</template>

<style scoped>
.moot-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.moot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: linear-gradient(135deg, #9b59b6, #8e44ad);
  border-radius: 8px;
  color: #fff;
}

.moot-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
  font-size: 13px;
}

/* ===== 开关 ===== */
.moot-switch {
  position: relative;
  width: 42px;
  height: 24px;
  flex-shrink: 0;
}

.moot-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.moot-switch .slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 24px;
  transition: 0.3s;
}

.moot-switch .slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.3s;
}

.moot-switch input:checked+.slider {
  background: #2ecc71;
}

.moot-switch input:checked+.slider::before {
  transform: translateX(18px);
}

/* ===== 状态卡片 ===== */
.status-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.status-card {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 8px 10px;
  text-align: center;
}

.status-card.active {
  border-color: #2ecc71;
}

.status-label {
  font-size: 10px;
  color: #999;
}

.status-value {
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

.status-card.blue .status-value {
  color: #197dea;
}

.status-card.green .status-value {
  color: #2ecc71;
}

.status-card.purple .status-value {
  color: #9b59b6;
}

/* ===== ★ 缓存集成状态栏 ★ ===== */
.cache-integration-bar {
  background: linear-gradient(135deg, #e8f8f5, #d5f5e3);
  border: 1px solid #2ecc71;
  border-radius: 8px;
  padding: 10px 12px;
}

.ci-title {
  font-size: 12px;
  font-weight: bold;
  color: #27ae60;
  margin-bottom: 6px;
}

.ci-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 6px;
}

.ci-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.ci-label {
  font-size: 9px;
  color: #888;
}

.ci-value {
  font-size: 16px;
  font-weight: bold;
  color: #333;
}

.ci-value.ai {
  color: #27ae60;
}

.ci-note {
  font-size: 9px;
  color: #666;
  line-height: 1.4;
  padding-top: 4px;
  border-top: 1px solid rgba(46, 204, 113, 0.3);
}

/* ===== 表单 ===== */
.form-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 11px;
  color: #555;
  font-weight: 500;
}

.form-input {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: #9b59b6;
}

.form-input:disabled {
  background: #f5f5f5;
  color: #999;
}

.form-hint {
  font-size: 9px;
  color: #999;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  cursor: pointer;
  color: #555;
}

/* ===== 规则表单 ===== */
.section-title {
  font-size: 12px;
  font-weight: bold;
  color: #555;
  padding-bottom: 4px;
  border-bottom: 1px solid #eee;
}

.rule-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #faf8ff;
  border: 1px solid #e8d5ff;
  border-radius: 8px;
  padding: 10px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.form-row .form-label {
  min-width: 110px;
  flex-shrink: 0;
}

.form-row .form-input {
  flex: 1;
}

.btn-add {
  align-self: flex-start;
  padding: 6px 16px;
  background: #9b59b6;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add:hover {
  background: #8e44ad;
}

/* ===== 文件上传 ===== */
.rule-file-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-upload {
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #9b59b6;
  color: #9b59b6;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-upload:hover {
  background: #9b59b6;
  color: #fff;
}

.file-hint {
  font-size: 9px;
  color: #999;
}

/* ===== 说明框 ===== */
.rule-explanation,
.cache-flow {
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 8px 10px;
}

.cache-flow {
  background: #f0fff4;
  border-color: #b2f2bb;
}

.expl-title {
  font-size: 11px;
  font-weight: bold;
  color: #555;
  margin-bottom: 4px;
}

.cache-flow .expl-title {
  color: #27ae60;
}

.expl-body {
  font-size: 10px;
  color: #666;
  line-height: 1.6;
}

.expl-body p {
  margin: 1px 0;
}

.expl-body .code-line {
  font-family: monospace;
  background: #eee;
  padding: 1px 4px;
  border-radius: 3px;
  display: inline-block;
}

.expl-body .highlight {
  color: #27ae60;
  font-weight: bold;
  margin-top: 4px;
}

/* ===== 测试 ===== */
.test-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.test-section .form-row {
  gap: 8px;
}

.btn-test {
  padding: 6px 14px;
  background: #6f42c1;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-test:hover:not(:disabled) {
  background: #5a32a3;
}

.btn-test:disabled {
  opacity: 0.6;
  cursor: wait;
}

.test-result-box {
  background: #f5f5f5;
  border-radius: 6px;
  padding: 6px 8px;
}

.test-label {
  font-size: 10px;
  color: #999;
  margin-bottom: 2px;
}

.test-result {
  font-size: 11px;
  color: #333;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

/* ===== 操作按钮 ===== */
.moot-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.btn-clear {
  flex: 1;
  min-width: 80px;
  padding: 6px 10px;
  background: #fff;
  color: #e74c3c;
  border: 1px solid #e74c3c;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
}

.btn-clear:hover {
  background: #e74c3c;
  color: #fff;
}

.btn-refresh {
  flex: 1;
  min-width: 80px;
  padding: 6px 10px;
  background: #fff;
  color: #3498db;
  border: 1px solid #3498db;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
}

.btn-refresh:hover {
  background: #3498db;
  color: #fff;
}

.btn-reset {
  padding: 6px 10px;
  background: #f8f9fa;
  color: #666;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
}

.btn-reset:hover {
  background: #e9ecef;
}
</style>

```

## `src/components/Settings.vue`

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import config, { Lang } from '../config';
import aiTranslator from '../core/aiTranslator';
import logger, { LogLevel } from '../core/logger';
import { saveJSONFile } from '../utils';
import { EngineType, FileFormat } from '../typings/enum';
import Icon from './Icon.vue';

const subTab = ref<'basic' | 'engine' | 'ai'>('basic');

const user = config.user;

const engineList = computed(() => [
  { key: EngineType.RPGMaker, label: 'RPG Maker', desc: 'RPG Maker MV/MZ 引擎' },
  { key: EngineType.PixiJS, label: 'PixiJS', desc: 'PixiJS 渲染引擎' },
  { key: EngineType.Cocos2d, label: 'Cocos2d-js', desc: 'Cocos2d-js 引擎' },
  { key: EngineType.Canvas2D, label: 'Canvas 2D', desc: '原生 Canvas 渲染' },
  { key: EngineType.Bitmap, label: 'Bitmap', desc: 'Bitmap 文本渲染' },
  { key: EngineType.WebSocket, label: 'WebSocket', desc: 'WS 网络拦截' },
  { key: EngineType.Fetch, label: 'Fetch API', desc: 'fetch 网络拦截' },
  { key: EngineType.XHR, label: 'XHR', desc: 'XMLHttpRequest 拦截' },
]);

const saveConfig = () => {
  aiTranslator.updateConfig();
  localStorage.setItem('LocalTranslatorUserConfig', JSON.stringify({
    fileName: user.fileName.userConfig,
    autoLoad: user.autoLoad.userConfig,
    transengine: user.transengine.userConfig,
    translatorName: user.translatorName.userConfig,
    targetLang: user.targetLang.userConfig,
    AI_BASE_URL: user.AI_BASE_URL.userConfig,
    AI_KEY: user.AI_KEY.userConfig,
    model: user.model.userConfig,
    maxReplaceCount: user.maxReplaceCount.userConfig,
    maxCacheSize: user.maxCacheSize.userConfig,
    maxLogCount: user.maxLogCount.userConfig,
    enableAI: user.enableAI.userConfig,
    aiTriggerThreshold: user.aiTriggerThreshold.userConfig,
    engines: user.engines.userConfig,
    exportFormat: user.exportFormat.userConfig,
  }));
  logger.addLog('✅ 配置已保存并应用', LogLevel.SUCCESS);
};

const testAI = async () => {
  if (!user.AI_KEY.userConfig) {
    logger.addLog('请先填写 AI API Key', LogLevel.WARNING);
    return;
  }
  aiTranslator.updateConfig();
  try {
    const result = await aiTranslator.translate('テストです');
    logger.addLog(`AI 测试翻译: "テストです" → "${result}"`, LogLevel.SUCCESS);
  } catch (e: any) {
    logger.addLog(`AI 测试失败: ${e.message}`, LogLevel.ERROR);
  }
};

const exportConfig = () => {
  const cfg = {
    targetLang: user.targetLang.userConfig,
    transengine: user.transengine.userConfig,
    translatorName: user.translatorName.userConfig,
    engines: user.engines.userConfig,
  };
  saveJSONFile(cfg, 'MTool_Config');
  logger.addLog('配置已导出', LogLevel.SUCCESS);
};
</script>

<template>
  <div class="settings-panel transparent-glass">
    <!-- 子 Tab -->
    <div class="sub-tabs">
      <button
        :class="{ active: subTab === 'basic' }"
        @click="subTab = 'basic'"
      >基本</button>
      <button
        :class="{ active: subTab === 'engine' }"
        @click="subTab = 'engine'"
      >引擎</button>
      <button
        :class="{ active: subTab === 'ai' }"
        @click="subTab = 'ai'"
      >AI翻译</button>
    </div>

    <!-- ===== 基本设置 ===== -->
    <div
      v-show="subTab === 'basic'"
      class="form-grid"
    >
      <label class="form-item">
        <span class="label">{{ user.fileName.description }}</span>
        <input
          type="text"
          v-model="user.fileName.userConfig"
          placeholder="default.json"
        >
      </label>

      <label class="form-item">
        <span class="label">导出格式</span>
        <select v-model="user.exportFormat.userConfig">
          <option :value="FileFormat.JSON">JSON</option>
          <option :value="FileFormat.CSV">CSV</option>
          <option :value="FileFormat.TSV">TSV</option>
        </select>
      </label>

      <label class="form-item">
        <span class="label">{{ user.transengine.description }}</span>
        <input
          type="text"
          v-model="user.transengine.userConfig"
          placeholder="Bing"
        >
      </label>

      <label class="form-item">
        <span class="label">{{ user.translatorName.description }}</span>
        <input
          type="text"
          v-model="user.translatorName.userConfig"
          placeholder="常规通用性修正"
        >
      </label>

      <label class="form-item">
        <span class="label">{{ user.targetLang.description }}</span>
        <select v-model="user.targetLang.userConfig">
          <option
            v-for="(label, key) in Lang"
            :key="key"
            :value="key"
          >{{ label }}</option>
        </select>
      </label>

      <label class="form-item checkbox">
        <input
          type="checkbox"
          v-model="user.autoLoad.userConfig"
        >
        <span>启动时自动加载缓存</span>
      </label>
    </div>

    <!-- ===== 引擎开关 ===== -->
    <div
      v-show="subTab === 'engine'"
      class="engine-list"
    >
      <div
        v-for="eng in engineList"
        :key="eng.key"
        class="engine-item"
      >
        <div class="engine-info">
          <div class="engine-label">{{ eng.label }}</div>
          <div class="engine-desc">{{ eng.desc }}</div>
        </div>
        <label class="switch">
          <input
            type="checkbox"
            :checked="user.engines.userConfig[eng.key]"
            @change="user.engines.userConfig[eng.key] = ($event.target as HTMLInputElement).checked"
          >
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <!-- ===== AI 翻译设置 ===== -->
    <div
      v-show="subTab === 'ai'"
      class="form-grid"
    >
      <label class="form-item checkbox">
        <input
          type="checkbox"
          v-model="user.enableAI.userConfig"
        >
        <span>启用 AI 翻译回退（未命中规则时自动调用 AI）</span>
      </label>

      <label class="form-item">
        <span class="label">{{ user.AI_BASE_URL.description }}</span>
        <input
          type="text"
          v-model="user.AI_BASE_URL.userConfig"
          placeholder="https://api.deepseek.com"
        >
      </label>

      <label class="form-item">
        <span class="label">{{ user.AI_KEY.description }}</span>
        <input
          type="password"
          v-model="user.AI_KEY.userConfig"
          placeholder="sk-..."
        >
      </label>

      <label class="form-item">
        <span class="label">{{ user.model.description }}</span>
        <input
          type="text"
          v-model="user.model.userConfig"
          :placeholder="user.model.default"
        >
      </label>

      <label class="form-item">
        <span class="label">AI 触发阈值（连续未命中次数）</span>
        <input
          type="number"
          min="1"
          max="50"
          v-model.number="user.aiTriggerThreshold.userConfig"
        >
      </label>

      <div class="ai-actions">
        <button
          class="btn-test"
          @click="testAI"
        >🧪 测试连接</button>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="settings-actions">
      <button
        class="btn-save"
        @click="saveConfig"
      >
        <Icon icon="upload" /> 保存配置
      </button>
      <button
        class="btn-export"
        @click="exportConfig"
      >
        <Icon icon="download" /> 导出配置
      </button>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  background: transparent;
  border-radius: 10px;
  padding: 14px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

/* ===== 子 Tab ===== */
.sub-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 14px;
  background: #f0f0f0;
  border-radius: 8px;
  padding: 3px;
}

.sub-tabs button {
  flex: 1;
  padding: 6px 8px;
  border: none;
  background: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  color: #666;
  transition: all 0.2s;
}

.sub-tabs button.active {
  background: #fff;
  color: #197dea;
  font-weight: bold;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* ===== 表单 ===== */
.form-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.form-item .label {
  color: #555;
  font-weight: 500;
}

.form-item input,
.form-item select {
  padding: 7px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
  transition: border-color 0.2s;
}

.form-item input:focus,
.form-item select:focus {
  border-color: #197dea;
}

.form-item.checkbox {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

/* ===== 引擎列表 ===== */
.engine-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.engine-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #eee;
}

.engine-label {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.engine-desc {
  font-size: 10px;
  color: #999;
  margin-top: 2px;
}

/* ===== 开关 ===== */
.switch {
  position: relative;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #ccc;
  border-radius: 22px;
  transition: 0.3s;
}

.slider::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.3s;
}

.switch input:checked+.slider {
  background: #197dea;
}

.switch input:checked+.slider::before {
  transform: translateX(18px);
}

/* ===== AI 操作 ===== */
.ai-actions {
  margin-top: 4px;
}

.btn-test {
  padding: 7px 16px;
  background: #6f42c1;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.btn-test:hover {
  background: #5a32a3;
}

/* ===== 底部按钮 ===== */
.settings-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.btn-save {
  flex: 2;
  padding: 9px;
  background: #197dea;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
}

.btn-save:hover {
  background: #0d6efd;
}

button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.btn-export {
  flex: 1;
  padding: 9px;
  background: #fff;
  color: #6c757d;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
}

.btn-export:hover {
  background: #f8f9fa;
}
</style>
```

## `src/components/Stats.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue';
import translator from '../core/translator';
import logger from '../core/logger';
import mootHook from '../core/mootHook';

const stats = computed(() => translator.getStats());
const logStats = computed(() => logger.getStats());
const mootStats = computed(() => mootHook.getStats());
const wsActive = computed(() => mootStats.value.installed);

const hitRateColor = computed(() => {
  const rate = stats.value.cacheHitRate;
  if (rate >= 80) return '#2ecc71';
  if (rate >= 50) return '#f39c12';
  return '#e74c3c';
});

const cacheUsagePercent = computed(() => {
  // const max = stats.value.cacheTotal || 1;
  return Math.min(100, (stats.value.cacheSize / 30000) * 100);
});

const compactInfo = computed(() => {
  const cs = stats.value.compactStats;
  if (!cs) return '';
  return `压缩率 ${cs.compressionRatio}% (${cs.originalCount}→${cs.compactedCount})`;
});

const ruleBreakdown = computed(() => {
  const s = stats.value;
  return {
    defaultRules: s.defaultRules || 0,
    userRules: s.userRules || 0,
    aiLearned: s.aiLearnedCount || 0,
    total: s.rules || 0,
  };
});
</script>

<template>
  <div class="stats-panel">
    <!-- 规则分布 -->
    <div class="section-title">规则分布</div>
    <div class="rule-breakdown">
      <div class="rb-item default">
        <span class="rb-dot"></span>
        <span class="rb-label">默认规则</span>
        <span class="rb-value">{{ ruleBreakdown.defaultRules }}</span>
        <span class="rb-note">（不导出）</span>
      </div>
      <div class="rb-item user">
        <span class="rb-dot"></span>
        <span class="rb-label">用户规则</span>
        <span class="rb-value">{{ ruleBreakdown.userRules }}</span>
      </div>
      <div class="rb-item ai">
        <span class="rb-dot"></span>
        <span class="rb-label">AI 学习</span>
        <span class="rb-value">{{ ruleBreakdown.aiLearned }}</span>
        <span class="rb-note">（AI 翻译后写入）</span>
      </div>
      <div class="rb-total">
        导出时包含：用户规则 + AI 学习 = {{ ruleBreakdown.userRules + ruleBreakdown.aiLearned }} 条
      </div>
    </div>

    <!-- 规则统计 -->
    <div
      class="section-title"
      style="margin-top: 14px;"
    >翻译引擎统计</div>
    <div class="stat-grid">
      <div class="stat-card blue">
        <div class="stat-value">{{ stats.rules }}</div>
        <div class="stat-label">总规则数</div>
      </div>
      <div class="stat-card green">
        <div class="stat-value">{{ stats.exactRules }}</div>
        <div class="stat-label">精确匹配</div>
      </div>
      <div class="stat-card purple">
        <div class="stat-value">{{ stats.regexRules }}</div>
        <div class="stat-label">正则规则</div>
      </div>
    </div>

    <!-- 压缩统计 -->
    <div
      class="compact-info"
      v-if="stats.compactStats"
    >
      <span class="dot"></span> {{ compactInfo }}
    </div>

    <!-- 缓存统计 -->
    <div
      class="section-title"
      style="margin-top: 16px;"
    >缓存状态</div>
    <div class="stat-grid">
      <div class="stat-card cyan">
        <div class="stat-value">{{ stats.cacheSize }}</div>
        <div class="stat-label">缓存条目</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-value">{{ stats.ignoreSize }}</div>
        <div class="stat-label">忽略条目</div>
      </div>
      <div
        class="stat-card"
        :style="{ borderColor: hitRateColor }"
      >
        <div
          class="stat-value"
          :style="{ color: hitRateColor }"
        >{{ stats.cacheHitRate }}%</div>
        <div class="stat-label">命中率</div>
      </div>
    </div>

    <!-- 缓存使用率 -->
    <div class="progress-section">
      <div class="progress-label">
        <span>缓存使用率</span>
        <span>{{ cacheUsagePercent }}%</span>
      </div>
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: cacheUsagePercent + '%' }"
        ></div>
      </div>
    </div>

    <!-- 日志统计 -->
    <div
      class="section-title"
      style="margin-top: 16px;"
    >日志统计</div>
    <div class="log-stats">
      <div class="log-stat-item info"><span class="dot"></span> 信息: {{ logStats.info }}</div>
      <div class="log-stat-item success"><span class="dot"></span> 成功: {{ logStats.success }}</div>
      <div class="log-stat-item warning"><span class="dot"></span> 警告: {{ logStats.warning }}</div>
      <div class="log-stat-item error"><span class="dot"></span> 错误: {{ logStats.error }}</div>
    </div>

    <!-- AI 翻译 -->
    <div
      class="section-title"
      style="margin-top: 16px;"
    >AI 翻译</div>
    <div class="ai-status">
      <div class="ai-stat">
        <span class="label">AI缓存:</span>
        <span class="value">{{ stats.aiCache.size }}</span>
      </div>
      <div class="ai-stat">
        <span class="label">进行中:</span>
        <span class="value">{{ stats.aiCache.pending }}</span>
      </div>
      <div class="ai-stat highlight">
        <span class="label">已学入主缓存:</span>
        <span class="value">{{ stats.aiLearnedCount }}</span>
      </div>
    </div>

    <!-- Moot Hook 状态 -->
    <div
      class="section-title"
      style="margin-top: 16px;"
    >Moot Hook</div>
    <div
      class="ws-status"
      :class="{ active: wsActive }"
    >
      <div class="ws-indicator">
        <span
          class="ws-dot"
          :class="{ on: wsActive }"
        ></span>
        <span class="ws-text">{{ wsActive ? '已激活' : '未激活' }}</span>
      </div>
      <div
        class="ws-detail"
        v-if="wsActive"
      >
        <div>请求拦截: {{ mootStats.requestsIntercepted }}/{{ mootStats.requestsSeen }}</div>
        <div>响应修正: {{ mootStats.responsesFixed }}</div>
        <div>缓存命中率: {{ mootStats.cacheHitRate }}</div>
      </div>
    </div>

    <!-- AI Fix Rules 统计 -->
    <div
      class="section-title"
      style="margin-top: 16px;"
    >🛠 AI 修正规则</div>
    <div class="stat-grid">
      <div class="stat-card violet">
        <div class="stat-value">{{ stats.aiFixRules }}</div>
        <div class="stat-label">修正规则</div>
      </div>
      <div class="stat-card pink">
        <div class="stat-value">{{ stats.aiFixHits }}</div>
        <div class="stat-label">命中次数</div>
      </div>
    </div>
    <div
      class="ai-fix-last"
      v-if="stats.aiFixLastFix"
    >
      <span class="label">最近修正:</span>
      <span class="value">{{ stats.aiFixLastFix }}</span>
    </div>
  </div>
</template>

<style scoped>
.stats-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-title {
  font-size: 12px;
  font-weight: bold;
  color: #555;
  padding-bottom: 6px;
  border-bottom: 1px solid #eee;
}

.rule-breakdown {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #eee;
}

.rb-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.rb-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.rb-item.default .rb-dot {
  background: #95a5a6;
}

.rb-item.user .rb-dot {
  background: #197dea;
}

.rb-item.ai .rb-dot {
  background: #9b59b6;
}

.rb-label {
  color: #666;
  min-width: 60px;
}

.rb-value {
  font-weight: bold;
  color: #333;
}

.rb-note {
  color: #bbb;
  font-size: 10px;
}

.rb-item.default .rb-value {
  color: #95a5a6;
}

.rb-item.user .rb-value {
  color: #197dea;
}

.rb-item.ai .rb-value {
  color: #9b59b6;
}

.rb-total {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed #ddd;
  font-size: 11px;
  font-weight: bold;
  color: #2ecc71;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.stat-card {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 10px 6px;
  text-align: center;
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.stat-value {
  font-size: 20px;
  font-weight: bold;
}

.stat-label {
  font-size: 10px;
  color: #999;
  margin-top: 2px;
}

.stat-card.blue .stat-value {
  color: #197dea;
}

.stat-card.green .stat-value {
  color: #2ecc71;
}

.stat-card.purple .stat-value {
  color: #9b59b6;
}

.stat-card.cyan .stat-value {
  color: #00bcd4;
}

.stat-card.orange .stat-value {
  color: #f39c12;
}

.stat-card.violet .stat-value {
  color: #8e44ad;
}

.stat-card.pink .stat-value {
  color: #e91e63;
}

.compact-info {
  font-size: 10px;
  color: #8e44ad;
  background: #f5eef8;
  padding: 3px 8px;
  border-radius: 4px;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.compact-info .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #8e44ad;
}

.progress-section {
  margin-top: 10px;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #666;
  margin-bottom: 4px;
}

.progress-bar {
  height: 6px;
  background: #eee;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #197dea, #4facfe);
  border-radius: 3px;
  transition: width 0.3s;
}

.log-stats {
  align-items: center;
  justify-content: center;
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.log-stat-item {
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 10px 16px;
  border-radius: 4px;
  background: #f8f9fa;
}

.log-stat-item .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.log-stat-item.info .dot {
  background: #197dea;
}

.log-stat-item.success .dot {
  background: #2ecc71;
}

.log-stat-item.warning .dot {
  background: #f39c12;
}

.log-stat-item.error .dot {
  background: #e74c3c;
}

.ai-status {
  display: flex;
  gap: 16px;
  padding: 8px 10px;
  background: #f8f9fa;
  border-radius: 8px;
}

.ai-stat {
  display: flex;
  gap: 4px;
  font-size: 12px;
}

.ai-stat .label {
  color: #999;
}

.ai-stat .value {
  font-weight: bold;
  color: #6f42c1;
}

.ai-stat.highlight .value {
  color: #9b59b6;
  font-size: 13px;
}

.ws-status {
  padding: 8px 10px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #eee;
  transition: all 0.3s;
}

.ws-status.active {
  background: #f0e6ff;
  border-color: #b794f4;
}

.ws-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ws-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ccc;
}

.ws-dot.on {
  background: #2ecc71;
  box-shadow: 0 0 6px rgba(46, 204, 113, 0.5);
  animation: pulse 2s infinite;
}

@keyframes pulse {

  0%,
  100% {
    opacity: 1
  }

  50% {
    opacity: 0.5
  }
}

.ws-text {
  font-size: 12px;
  font-weight: bold;
  color: #666;
}

.ws-status.active .ws-text {
  color: #6a3fa0;
}

.ws-detail {
  margin-top: 6px;
  font-size: 10px;
  color: #888;
  line-height: 1.6;
}

.ai-fix-last {
  margin-top: 6px;
  padding: 4px 8px;
  background: #fce4ec;
  border-radius: 4px;
  font-size: 10px;
  display: flex;
  gap: 4px;
  align-items: center;
}

.ai-fix-last .label {
  color: #999;
  flex-shrink: 0;
}

.ai-fix-last .value {
  color: #c2185b;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
```

