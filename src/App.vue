<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, defineAsyncComponent, watch } from 'vue';
import translator from './core/translator';
import { installEngineHooks, scanRPGMakerDialog } from './core/hookManager';
import { uninstallAllEngineHooks } from './core/hookManager';
import Icon, { type IconType } from './components/Icon.vue';
import config from './config';
import { safeJSONParse } from './utils';
import cache from './core/cache';

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
  setTimeout(() => {
    scanRPGMakerDialog((texts: Set<string>) => {
      if (texts && texts.size > 0 && translator.isPreTranslated() === false) {
        isPreTranslating.value = true;
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
  uninstallAllEngineHooks();
});

const translateCount = computed(() => cache.size);

// ==================== 引擎开关动态监听 ====================
watch(
  () => ({ ...config.getEngines() }),
  (newCfg, oldCfg) => {
    if (!oldCfg) return;
    // console.log('[MToolTranslatorPlugin][App] 引擎配置变化', { newCfg, oldCfg });
    installEngineHooks(
      (text: string) => {
        if (!text || text.length === 0) return text;
        if (typeof text !== 'string') return text;
        return translator.interceptText(text);
      },
      newCfg,
      {
        xhrOptions: {
          urlPatterns: [
            "http://127.0.0.1:64002/wslikecmd"
          ],
          method: 'POST',
          transformRequest(body, _) {
            const data = safeJSONParse(body);
            if (data && data.cmd && typeof data.cmd === 'string' && data.cmd === 'trs' && data.args && data.args.length > 0 && data.type && typeof data.type === 'number' && data.type === 1) {
              if(config.debug) {
                console.log("拦截翻译请求", data);
              }
              translator.addCache(data.args[0]);
            }
            return body;
          },
          transformResponse(data: API.MootResponse, _) {
            if (data.ret && typeof data.ret === 'string' && data.type && typeof data.type === 'number' && data.type === 1) {
              if(config.debug) {
                console.log("拦截翻译响应", data);
              }
              data.ret = translator.interceptText(data.ret);
            }
            return data;
          },
        }
      }
      
    );
  },
  { deep: true }
);

// ==================== 优化操作 ====================

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
  const allTexts = new Set<string>();
  for (const key of Object.keys(window.$data || {})) {
    const data = (window.$data as any)[key];
    if (data) collectTexts(data, allTexts);
  }
  if (allTexts.size > 0) {
    isPreTranslating.value = true;
    setTimeout(() => {
      try {
        translator.preTranslate(allTexts);
      } catch (e: any) {
        console.error('[MToolTranslatorPlugin] 预翻译失败:', e);
      } finally {
        isPreTranslating.value = false;
      }
    }, 0);
  }
};

function collectTexts(obj: any, set: Set<string>) {
  if (obj === null || obj === undefined) return;
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
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
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