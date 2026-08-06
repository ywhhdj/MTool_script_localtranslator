<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import config from '../config';
import translator from '../core/translator';
import logger, { LogLevel } from '../core/logger';
import Icon from './Icon.vue';
import { downloadBlob, timestampFileName } from '../utils';
import { FileFormat } from '../typings/enum';

const isDragging = ref(false);
const isLoading = ref(false);
const loadedFiles = reactive<Array<{ name: string; rules: number; time: string }>>([]);
const fileInput = ref<HTMLInputElement | null>(null);

const onDragOver = (e: DragEvent) => {
  e.preventDefault();
  isDragging.value = true;
};

const onDragLeave = () => {
  isDragging.value = false;
};

const onDrop = async (e: DragEvent) => {
  e.preventDefault();
  isDragging.value = false;
  const files = Array.from(e.dataTransfer?.files || []);
  await processFiles(files);
};


const triggerUpload = () => fileInput.value?.click();

const onFileSelect = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const files = Array.from(target.files || []);
  await processFiles(files);
  target.value = ''; // 重置，允许重复选同一文件
};

const processFiles = async (files: File[]) => {
  if (files.length === 0) return;
  isLoading.value = true;

  for (const file of files) {
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['json', 'csv', 'tsv', 'xlsx', 'xls'].includes(ext || '')) {
        logger.addLog(`跳过不支持的文件: ${file.name}`, LogLevel.WARNING);
        continue;
      }

      const success = await translator.loadFromFile(file);
      if (success) {
        loadedFiles.unshift({
          name: file.name,
          rules: translator.getStats().rules,
          time: new Date().toLocaleTimeString(),
        });
        // 更新配置中的文件名
        config.user.fileName.userConfig = file.name;
      }
    } catch (e: any) {
      logger.addLog(`处理文件失败 [${file.name}]: ${e.message}`, LogLevel.ERROR);
    }
  }

  isLoading.value = false;
};

const exportData = () => {
  const format = config.user.exportFormat.userConfig || FileFormat.JSON;
  const { data, fileName } = translator.exportRules(format);
  const mime = format === FileFormat.JSON ? 'application/json' : 'text/csv';
  downloadBlob(data, fileName, mime);
  logger.addLog(`导出成功: ${fileName}`, LogLevel.SUCCESS);
};

const exportLogs = () => {
  const text = logger.exportLogs();
  const fileName = timestampFileName('MTool_Logs', 'txt');
  downloadBlob(text, fileName, 'text/plain');
};

const clearAll = () => {
  if (!confirm('确定要清除所有翻译数据和缓存吗？')) return;
  translator.reset();
  loadedFiles.splice(0, loadedFiles.length);
  localStorage.removeItem('LocalTranslatorGameCache');
  const fn = config.user.fileName.userConfig;
  localStorage.removeItem(`cache_${fn}`);
  logger.addLog('所有数据已清除', LogLevel.WARNING);
};

const DraggingText = computed(() => {
  return isDragging.value ? '松开以上传文件' : '拖拽文件到此处，或点击浏览'
})
</script>

<template>
  <div class="file-upload">
    <!-- 拖拽区域 -->
    <div
      class="drop-zone"
      :class="{ dragging: isDragging, loading: isLoading }"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
      @click="triggerUpload"
    >
      <div
        v-if="!isLoading"
        class="drop-content"
      >
        <div class="drop-icon">
          <Icon
            v-show="isDragging"
            :size="36"
            icon="download"
          />
          <Icon
            v-show="!isDragging"
            :size="36"
            icon="upload"
          />
        </div>
        <div class="drop-text">
          {{ DraggingText }}
        </div>
        <div class="drop-hint">支持 .json / .csv / .tsv / .xlsx</div>
      </div>
      <div
        v-else
        class="drop-content"
      >
        <div class="loading-spinner"></div>
        <div class="drop-text">正在处理文件...</div>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      multiple
      accept=".json,.csv,.tsv,.xlsx,.xls"
      style="display: none"
      @change="onFileSelect"
    />

    <!-- 已加载文件列表 -->
    <div
      v-if="loadedFiles.length > 0"
      class="file-list"
    >
      <div class="section-title">📋 已加载文件</div>
      <div
        v-for="(f, i) in loadedFiles"
        :key="i"
        class="file-item"
      >
        <span class="file-icon">📄</span>
        <span
          class="file-name"
          :title="f.name"
        >{{ f.name }}</span>
        <span class="file-rules">{{ f.rules }} 条</span>
        <span class="file-time">{{ f.time }}</span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="actions">
      <button
        class="btn btn-primary"
        @click="exportData"
      >
        <Icon icon="upload" />导出翻译
      </button>
      <button
        class="btn btn-secondary"
        @click="exportLogs"
      >
        <Icon icon="schedule" /> 导出日志
      </button>
      <button
        class="btn btn-danger"
        @click="clearAll"
      >
        <Icon icon="delete" /> 清除数据
      </button>
    </div>
  </div>
</template>

<style scoped>
.file-upload {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ========== 拖拽区域 ========== */
.drop-zone {
  border: 2px dashed #ccc;
  border-radius: 12px;
  padding: 24px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  background: #fff;
}

.drop-zone:hover {
  border-color: #197dea;
  background: #f0f7ff;
}

.drop-zone.dragging {
  border-color: #197dea;
  background: #e3f2fd;
  transform: scale(1.02);
}

.drop-zone.loading {
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
  font-size: 32px;
}

.drop-text {
  font-size: 13px;
  color: #333;
  font-weight: 500;
}

.drop-hint {
  font-size: 11px;
  color: #999;
}

/* ========== 加载动画 ========== */
.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #e0e0e0;
  border-top-color: #197dea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ========== 文件列表 ========== */
.file-list {
  background: #fff;
  border-radius: 8px;
  padding: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.section-title {
  font-size: 12px;
  font-weight: bold;
  color: #555;
  margin-bottom: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
  border-bottom: 1px solid #f5f5f5;
  font-size: 12px;
}

.file-item:last-child {
  border-bottom: none;
}

.file-icon {
  font-size: 14px;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #333;
}

.file-rules {
  background: #e8f4fd;
  color: #197dea;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
  white-space: nowrap;
}

.file-time {
  color: #999;
  font-size: 10px;
  white-space: nowrap;
}

/* ========== 按钮 ========== */
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn {
  flex: 1;
  min-width: 80px;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  align-items: center;
  justify-content: center;
}

button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.btn-primary {
  background: #197dea;
  color: #fff;
}

.btn-primary:hover {
  background: #0d6efd;
}

.btn-secondary {
  background: #6c757d;
  color: #fff;
}

.btn-secondary:hover {
  background: #5a6268;
}

.btn-danger {
  background: #fff;
  color: #dc3545;
  border: 1px solid #dc3545 !important;
}

.btn-danger:hover {
  background: #dc3545;
  color: #fff;
}
</style>