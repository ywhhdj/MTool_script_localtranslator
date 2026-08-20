<script setup lang="ts">
import { computed, ref } from 'vue';
import translator from '../core/translator';
import logger, { LogLevel } from '../core/logger';
import config from '../config';
import {
  getFileType,
  timestampFileName,
  download,
  getGameName
} from '../utils';
import Icon from './Icon.vue';
import cache from '../core/cache';

const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const dragOver = ref(false);
const uploadResult = ref<{
  type: 'translation' | 'aiFix' | 'mixed';
  translationCount: number;
  aiFixCount: number;
  fileName: string;
} | null>(null);

const triggerFileSelect = () => fileInput.value?.click();

const isSupportedFileType = (fileName: string): boolean => {
  return ['json', 'csv', 'tsv', 'xlsx', 'xls'].includes(getFileType(fileName));
}

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
  uploadResult.value = null;

  try {
    const result = await translator.loadUniversalFile(file);
    uploadResult.value = {
      ...result,
      fileName: file.name,
    };
    config.user.fileName.userConfig = file.name;
    // 根据用户设置自动保存
    if (config.user.autoLoad.userConfig) {
      // 触发保存
      translator['_saveTranslationData']?.();
    }

  } catch (e: any) {
    logger.addLog(`文件处理失败 [${file.name}]: ${e.message}`, LogLevel.ERROR);
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

// ==================== 导出 ====================

const exportData = async () => {
  const format = config.user.exportFormat.userConfig || 'json';
  const { data, fileName } = translator.exportTranslationData(format);
  if(typeof format === "undefined") return;
  await download(data, fileName, format);
  logger.addLog(`导出成功: ${fileName}`, LogLevel.SUCCESS);
};

const exportAIFixRules = async (format: 'json' | 'csv' = 'json') => {
  const { data, fileName } = translator.exportAIFixRules(format);
  await download(data, fileName, format);
  logger.addLog(`AI Fix 规则导出成功: ${fileName}`, LogLevel.SUCCESS);
};

const exportLogs = async () => {
  const text = logger.exportLogs();
  const fileName = timestampFileName(`Logs_${getGameName()}`, 'txt');
  await download(text, fileName, 'txt');
};

// ==================== 清除 ====================

const clearAll = () => {
  if (!confirm('确定要清除所有用户翻译数据和缓存吗？（默认规则将保留）')) return;
  translator.reset();
  cache.clear();
  localStorage.removeItem('LocalTranslatorGameCache');
  const fn = config.user.fileName.userConfig;
  localStorage.removeItem(`cache_${fn}`);
  uploadResult.value = null;
  logger.addLog('所有用户数据已清除（默认规则保留）', LogLevel.WARNING);
};

// ==================== 手动添加 AI Fix 规则 ====================

const newAaa = ref('');
const newBbb = ref('');
const newCcc = ref('');
const isRegex = ref(false);

const addAIFixRule = () => {
  if (!newAaa.value.trim()) {
    logger.addLog('aaa (原文/正则) 不能为空', LogLevel.WARNING);
    return;
  }
  if (!newCcc.value.trim()) {
    logger.addLog('ccc (替换结果) 不能为空', LogLevel.WARNING);
    return;
  }

  let aaa: string | RegExp = newAaa.value.trim();
  let bbb: string | RegExp = newBbb.value.trim();

  if (isRegex.value) {
    try {
      const m1 = aaa.match(/^\/(.+?)\/([gimsuy]*)$/);
      if (m1) {
        const flags = m1[2] || 'g';
        aaa = new RegExp(m1[1], flags.includes('g') ? flags : flags + 'g');
      }
      if (bbb) {
        const m2 = bbb.match(/^\/(.+?)\/([gimsuy]*)$/);
        if (m2) {
          const flags = m2[2] || 'g';
          bbb = new RegExp(m2[1], flags.includes('g') ? flags : flags + 'g');
        }
      }
    } catch (e: any) {
      logger.addLog(`正则解析失败: ${e.message}`, LogLevel.ERROR);
      return;
    }
  }

  translator.addAIFixRule(aaa, bbb, newCcc.value.trim());
  newAaa.value = '';
  newBbb.value = '';
  newCcc.value = '';
};

// ==================== 规则列表显示 ====================

const translationRulesCount = () => translator.stats.userRules;
const aiFixRulesCount = () => translator.stats.aiFixRules;

const fileType = computed(() => {
  return ['json', 'csv', 'tsv', 'xlsx', 'xls'].map(t => `.${t}`).join(',');
});
const resultIconText = computed(() => {
  return uploadResult?.value?.type === 'aiFix' ? '🔧' : uploadResult?.value?.type === 'mixed' ? '🔀' : '📝'
})
</script>

<template>
  <div class="upload-panel">
    <!-- 上传结果提示 -->
    <transition name="fade">
      <div
        v-if="uploadResult"
        class="upload-result"
        :class="uploadResult.type"
      >
        <span class="result-icon">
          {{ resultIconText }}
        </span>
        <div class="result-text">
          <strong>{{ uploadResult.fileName }}</strong>
          <div class="result-detail">
            <span v-if="uploadResult.translationCount > 0">
              翻译规则: {{ uploadResult.translationCount }} 条
            </span>
            <span v-if="uploadResult.aiFixCount > 0">
              AI Fix 规则: {{ uploadResult.aiFixCount }} 条
            </span>
          </div>
        </div>
      </div>
    </transition>

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
          <p>自动识别：翻译规则 / AI Fix 规则 / CollData.json</p>
        </div>
      </div>
      <div
        v-else
        class="drop-content uploading-content"
      >
        <div class="spinner"></div>
        <span>正在处理文件...</span>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      :accept="fileType"
      style="display: none"
      @change="onFileSelected"
    >

    <!-- 当前文件信息 -->
    <div class="current-file">
      <span class="label">当前文件:</span>
      <span class="filename">{{ config.user.fileName.userConfig }}</span>
    </div>

    <!-- 规则统计 -->
    <div class="stats-bar">
      <div class="stat-chip">
        <span class="stat-label">翻译规则</span>
        <span class="stat-value">{{ translationRulesCount() }}</span>
      </div>
      <div class="stat-chip ai">
        <span class="stat-label">AI Fix 规则</span>
        <span class="stat-value">{{ aiFixRulesCount() }}</span>
      </div>
      <div class="stat-chip cache">
        <span class="stat-label">缓存</span>
        <span class="stat-value">{{ translator.stats.cacheSize }}</span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="actions">
      <button
        class="btn btn-primary"
        @click="exportData"
      >
        <Icon icon="upload" /> 导出翻译
      </button>
      <button
        class="btn btn-ai"
        @click="exportAIFixRules('json')"
      >
        <Icon icon="key" /> 导出AI规则
      </button>
      <button
        class="btn btn-secondary"
        @click="exportLogs"
      >
        <Icon icon="schedule" /> 日志
      </button>
      <button
        class="btn btn-danger"
        @click="clearAll"
      >
        <Icon icon="delete" /> 清除
      </button>
    </div>

    <!-- 手动添加 AI Fix 规则 -->
    <div class="add-section">
      <div class="section-title">➕ 手动添加 AI Fix 规则</div>
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
          placeholder='留空=不检查AI译文'
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
          @click="addAIFixRule"
        >添加规则</button>
      </div>
    </div>

    <!-- 提示 -->
    <div class="hint">
      <p><strong>📌 自动识别规则：</strong></p>
      <ul>
        <li><b>两列</b> → 翻译规则（原文 → 译文）</li>
        <li><b>三列</b> → AI Fix 规则（aaa原文 + bbb译文匹配 + ccc替换）</li>
        <li><b>CollData.json</b> → 自动解析 data[].data 数组</li>
      </ul>
      <p style="margin-top:4px;"><strong>📌 支持格式：</strong></p>
      <ul>
        <li><b>JSON:</b> {"原文": "译文"} 或 [["原文","译文"]]</li>
        <li><b>CSV/TSV:</b> 两列=翻译规则，三列=AI Fix 规则</li>
        <li><b>XLSX:</b> 第一行表头，后续行按列数自动判断</li>
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

/* ========== 上传结果提示 ========== */
.upload-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  animation: slideUp 0.3s ease;
}

.upload-result.translation {
  background: #e8f4fd;
  border: 1px solid #197dea;
}

.upload-result.aiFix {
  background: #f0e6ff;
  border: 1px solid #9b59b6;
}

.upload-result.mixed {
  background: #fff3cd;
  border: 1px solid #f39c12;
}

.result-icon {
  font-size: 20px;
}

.result-text strong {
  font-size: 12px;
  color: #333;
}

.result-detail {
  display: flex;
  gap: 8px;
  font-size: 10px;
  color: #666;
  margin-top: 2px;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ========== 拖拽区域 ========== */
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

/* ========== 当前文件 ========== */
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

/* ========== 统计条 ========== */
.stats-bar {
  display: flex;
  gap: 6px;
}

.stat-chip {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 4px;
  background: #e8f4fd;
  border-radius: 6px;
  border: 1px solid #b0d4f0;
}

.stat-chip.ai {
  background: #f0e6ff;
  border-color: #d4b5ff;
}

.stat-chip.cache {
  background: #e8f8f0;
  border-color: #b2f2bb;
}

.stat-label {
  font-size: 9px;
  color: #888;
}

.stat-value {
  font-size: 16px;
  font-weight: bold;
  color: #197dea;
}

.stat-chip.ai .stat-value {
  color: #9b59b6;
}

.stat-chip.cache .stat-value {
  color: #27ae60;
}

/* ========== 按钮 ========== */
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.btn {
  flex: 1;
  min-width: 70px;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  transition: all 0.2s;
}

.btn-primary {
  border-color: #197dea;
  color: #197dea;
}

.btn-primary:hover {
  background: #197dea;
  color: #fff;
}

.btn-ai {
  border-color: #9b59b6;
  color: #9b59b6;
}

.btn-ai:hover {
  background: #9b59b6;
  color: #fff;
}

.btn-secondary {
  border-color: #3498db;
  color: #3498db;
}

.btn-secondary:hover {
  background: #3498db;
  color: #fff;
}

.btn-danger {
  border-color: #e74c3c;
  color: #e74c3c;
}

.btn-danger:hover {
  background: #e74c3c;
  color: #fff;
}

/* ========== 手动添加 ========== */
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

/* ========== 提示 ========== */
.hint {
  font-size: 10px;
  color: #888;
  background: #f8f9fa;
  border-radius: 6px;
  padding: 8px 10px;
}

.hint p {
  margin: 0 0 4px 0;
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