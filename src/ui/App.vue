<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  defineAsyncComponent,
  watch,
} from 'vue';
import { container, translator, config, hookManager, cache } from '../core';
import { collectTexts } from '../core/hooks/engine-hooks';
import { useHeartbeat } from '../shared';
import Icon, { type IconType } from './components/base/Icon.vue';

type Tab = 'files' | 'settings' | 'logs' | 'stats' | 'moot' | 'cheat';

const show = ref(false);
const activeTab = ref<Tab>('files');
const panelWidth = ref(360);
const isDragging = ref(false);
const isPreTranslating = ref(false);
const compactResult = ref<any>(null);

const tabsItems: { key: Tab; label: string; icon: IconType }[] = [
  { key: 'files', label: '文件', icon: 'folder' },
  { key: 'settings', label: '设置', icon: 'settings' },
  { key: 'stats', label: '统计', icon: 'chart' },
  { key: 'moot', label: 'Moot', icon: 'key' },
  { key: 'logs', label: '日志', icon: 'schedule' },
  { key: 'cheat', label: '修改器', icon: 'cheat' },
];

/** 拖拽改宽度：使用一次性监听 + 卸载兜底清理，避免监听器泄漏 */
const startDrag = () => {
  isDragging.value = true;
  document.body.style.cursor = 'ew-resize';
  const onMove = (ev: MouseEvent) => {
    if (!isDragging.value) return;
    panelWidth.value = Math.max(280, Math.min(600, window.innerWidth - ev.clientX));
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

const toggle = () => {
  show.value = !show.value;
};

// ==================== 预翻译 ====================

/**
 * 扫描 RPG Maker 的文本素材,最多 12 次，之后彻底放弃。
 */
const SCAN_MAX_TRIES = 12;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let scanTries = 0;

const scanOnce = (onDone: (texts: Set<string>) => void) => {
  const $data = (window as any).$data;
  if (!$data) {
    if (scanTries++ >= SCAN_MAX_TRIES) return;
    scanTimer = setTimeout(() => scanOnce(onDone), 500);
    return;
  }
  const texts = new Set<string>();
  for (const key of Object.keys($data)) {
    if ($data[key]) collectTexts($data[key], texts);
  }
  onDone(texts);
};

const runPreTranslateWith = (texts: Set<string>) => {
  if (texts.size === 0) return;
  isPreTranslating.value = true;
  // 让出一帧，避免上万条文本同步处理时卡住首屏渲染
  setTimeout(() => {
    try {
      translator.preTranslate(texts);
    } catch (e: any) {
      console.error('[MToolTranslatorPlugin] 预翻译失败:', e);
    } finally {
      isPreTranslating.value = false;
    }
  }, 0);
};

const rescanAndPreTranslate = () => {
  if (typeof (window as any).DataManager === 'undefined') return;
  const texts = new Set<string>();
  const $data = (window as any).$data || {};
  for (const key of Object.keys($data)) {
    if ($data[key]) collectTexts($data[key], texts);
  }
  runPreTranslateWith(texts);
};

// ==================== 引擎开关联动 ====================

watch(
  () => ({ ...config.getEngines() }),
  () => {
    hookManager.install();
  },
  { deep: true }
);

// ==================== 徽标计数（复用全局心跳，不再单开 interval）====================

const hb = useHeartbeat(1500);
const translateCount = computed(() => {
  void hb.value;
  return cache.size;
});

// ==================== 优化操作 ====================

const runCompact = () => {
  try {
    compactResult.value = translator.compactRules(4);
  } catch (e: any) {
    console.error('[MToolTranslatorPlugin] 压缩失败:', e);
  }
};

/** 手动触发：重新扫描 $data 并预热缓存（默认不写入规则库，避免规则爆炸） */
const runPreTranslate = () => {
  rescanAndPreTranslate();
};

onMounted(() => {
  scanTimer = setTimeout(() => scanOnce(runPreTranslateWith), 500);
});

onUnmounted(() => {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = null;
  container.dispose();
});

const components: Record<Tab, any> = {
  settings: defineAsyncComponent(() => import('./components/Settings.vue')),
  stats: defineAsyncComponent(() => import('./components/Stats.vue')),
  moot: defineAsyncComponent(() => import('./components/MootPanel.vue')),
  logs: defineAsyncComponent(() => import('./components/Logger.vue')),
  files: defineAsyncComponent(() => import('./components/FileUpload.vue')),
  cheat: defineAsyncComponent(() => import('./components/CheatPanel.vue')),
};
const Component = computed(() => components[activeTab.value]);
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
      v-if="translateCount > 0"
    >{{ translateCount }}</span>
    <!-- <span
      class="trigger-badge pretrans"
      v-if="cache.preTranslated"
      title="预翻译已完成"
    >✓</span> -->
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
        <!-- <span
          class="optimize-badge"
          v-if="stats.preTranslated"
          title="预翻译已生效"
        >⚡预翻译</span> -->
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
        <KeepAlive>
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
          :disabled="isPreTranslating"
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
:root {
  --accent-bg: linear-gradient(90deg, rgba(0, 118, 253, 0.44) 0%, rgba(255, 255, 255, 0.1) 100%);
}

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

.mtool-panel button,
.mtool-trigger button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: none;
}

.mtool-panel button:hover,
.mtool-trigger button:hover {
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
