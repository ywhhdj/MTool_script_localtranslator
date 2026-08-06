<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import FileUpload from './components/FileUpload.vue';
import Logger from './components/Logger.vue';
import Settings from './components/Settings.vue';
import Stats from './components/Stats.vue';
import translator from './core/translator';
import { hookRPGMakerDialog } from './core/hook';
import Icon from './components/Icon.vue';

const show = ref(false);
const activeTab = ref<'files' | 'settings' | 'logs' | 'stats'>('files');
const panelWidth = ref(360);
const isDragging = ref(false);

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
  hookRPGMakerDialog((texts: Set<string>) => {
    // 扫描完成后，自动执行预翻译
    if (texts.size > 0 && translator.isPreTranslated() === false) {
      isPreTranslating.value = true;
      // 用 setTimeout 让 UI 有机会更新
      setTimeout(() => {
        try {
          translator.preTranslate(texts);
        } catch (e: any) {
          console.error('[MTool] 预翻译失败:', e);
        } finally {
          isPreTranslating.value = false;
        }
      }, 0);
    }
  });

  translator.init();
});

onUnmounted(() => {
  translator.destroy();
});

const stats = computed(() => translator.getStats());

// ===== 优化操作 =====

/** 手动触发规则压缩 */
const runCompact = () => {
  try {
    compactResult.value = translator.compactRules(4);
  } catch (e: any) {
    console.error('[MTool] 压缩失败:', e);
  }
};

/** 手动触发预翻译（重新扫描） */
const runPreTranslate = () => {
  if (typeof window.DataManager === 'undefined') {
    console.warn('[MTool] DataManager 不可用');
    return;
  }
  // 强制重新扫描
  const allTexts = new Set<string>();
  // 遍历所有已加载的数据
  for (const key of Object.keys(window.$data || {})) {
    const data = (window as any)[key];
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
          :class="{ active: activeTab === 'files' }"
          @click="activeTab = 'files'"
        >
          <Icon icon="folder" /> 文件
        </button>
        <button
          :class="{ active: activeTab === 'settings' }"
          @click="activeTab = 'settings'"
        >
          <Icon icon="settings" /> 设置
        </button>
        <button
          :class="{ active: activeTab === 'stats' }"
          @click="activeTab = 'stats'"
        >
          <Icon icon="chart" /> 统计
        </button>
        <button
          :class="{ active: activeTab === 'logs' }"
          @click="activeTab = 'logs'"
        >
          <Icon icon="schedule" /> 日志
        </button>
      </div>

      <!-- Tab 内容 -->
      <div class="mtool-content">
        <FileUpload v-show="activeTab === 'files'" />
        <Settings v-show="activeTab === 'settings'" />
        <Stats v-show="activeTab === 'stats'" />
        <Logger v-show="activeTab === 'logs'" />
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
/* ========== 全局样式 ========== */
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
  padding: 0 8px;
}

.mtool-tabs button {
  flex: 1;
  padding: 10px 4px;
  border: none;
  background: none;
  font-size: 12px;
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
