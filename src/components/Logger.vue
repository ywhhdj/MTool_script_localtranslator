<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted } from 'vue';
import logger, { type LogFilter, type LogEntry, LogLevel } from '../core/logger';
import Icon from './Icon.vue';

const logs = logger.log_queue;
const filter = ref<LogFilter>('total');
const searchText = ref('');
const autoScroll = ref(true);
const containerRef = ref<HTMLDivElement | null>(null);
const filterLevels = computed((): {
  label: string;
  value: LogFilter;
}[] => [
  { label: '全部', value: 'total' },
  { label: '信息', value: LogLevel.INFO },
  { label: '成功', value: LogLevel.SUCCESS },
  { label: '警告', value: LogLevel.WARNING },
  { label: '错误', value: LogLevel.ERROR },
]);

const filteredLogs = computed(() => {
  let result = logs;
  if (filter.value !== 'total') {
    result = result.filter((l: LogEntry) => l.level === filter.value);
  }
  if (searchText.value.trim()) {
    const q = searchText.value.toLowerCase();
    result = result.filter((l: LogEntry) => l.text.toLowerCase().includes(q));
  }
  return result;
});

const stats = computed(() => logger.stats);

const clearLogs = () => logger.clearLog();

const autoScroll_ = async () => {
  if (!autoScroll.value) return;
  await nextTick();
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight;
  }
}

watch(filteredLogs, autoScroll_, { deep: true });

onMounted(() => {
  autoScroll_();
});
</script>

<template>
  <div class="logger">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="filter-group">
        <button
          v-for="level in filterLevels"
          :key="level.value"
          :class="{ active: filter === level.value }"
          @click="filter = level.value"
        >{{ level.label }} {{ stats[level.value] }}</button>
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
  background: var(--accent-color);
}

.log-item.success {
  background: var(--success-color);
}

.log-item.warning {
  background: var(--warning-color);
}

.log-item.error {
  background: var(--danger-color);
}
</style>