<script setup lang="ts">
import { ref, computed } from 'vue';
import { config, Lang, aiTranslator, logger, cache, translator } from '../../core';
import { saveJSONFile } from '../../shared';
import { EngineType, LogLevel } from '../../typings/enum';
import Icon from './base/Icon.vue';
import ToggleSwitch from './base/ToggleSwitch.vue';

defineOptions({ name: 'settings' });

const subTab = ref<'basic' | 'engine' | 'ai'>('basic');
const user = config.user;

const engineList = computed(() => [
  { key: EngineType.RPGMaker, label: 'RPG Maker', desc: 'RPG Maker MV/MZ 引擎' },
  { key: EngineType.PixiJS, label: 'PixiJS', desc: 'PixiJS 渲染引擎' },
  { key: EngineType.Cocos2d, label: 'Cocos2d-js', desc: 'Cocos2d-js 引擎' },
  { key: EngineType.Canvas2D, label: 'Canvas 2D', desc: '原生 Canvas 渲染' },
  { key: EngineType.Bitmap, label: 'Bitmap', desc: 'Bitmap 文本渲染' },
  { key: EngineType.Phaser, label: 'Phaser', desc: 'Phaser 游染引擎' },
  { key: EngineType.WebSocket, label: 'WebSocket', desc: 'WS 网络拦截' },
  { key: EngineType.Fetch, label: 'Fetch API', desc: 'fetch 网络拦截' },
  { key: EngineType.XHR, label: 'XHR', desc: 'XMLHttpRequest 拦截' },
]);

const saveConfig = () => {
  aiTranslator.updateConfig();
  cache.setMaxSize(user.maxCacheSize.userConfig);
  logger.setMaxCount(user.maxLogCount.userConfig);
  config.saveToStorage();
  translator.installHooks();
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

const exportConfig = async () => {
  const cfg = {
    targetLang: user.targetLang.userConfig,
    transengine: user.transengine.userConfig,
    translatorName: user.translatorName.userConfig,
    engines: user.engines.userConfig,
  };
  await saveJSONFile(cfg, 'MTool_Config');
  logger.addLog('配置已导出', LogLevel.SUCCESS);
};
</script>

<template>
  <div class="settings-panel transparent-glass">
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
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
          <option value="tsv">TSV</option>
        </select>
      </label>
      <label class="form-item">
        <span class="label">{{ user.transengine.description }}</span>
        <input
          type="text"
          v-model="user.transengine.userConfig"
          :placeholder="user.transengine.default"
        >
      </label>
      <label class="form-item">
        <span class="label">{{ user.translatorName.description }}</span>
        <input
          type="text"
          v-model="user.translatorName.userConfig"
          :placeholder="user.translatorName.default"
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
        <ToggleSwitch
          size="md"
          :model-value="!!user.engines.userConfig[eng.key]"
          @update:model-value="user.engines.userConfig[eng.key] = $event"
        />
      </div>
    </div>

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
          :placeholder="user.AI_BASE_URL.default"
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
/* 与原文一致，仅删除 .switch / .slider 段落 */
.settings-panel {
  background: transparent;
  border-radius: 10px;
  padding: 14px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

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

button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
</style>