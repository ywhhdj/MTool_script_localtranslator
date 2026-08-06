<script setup lang="ts">
import { computed } from 'vue';
import translator from '../core/translator';
import logger from '../core/logger';

const stats = computed(() => translator.getStats());
const logStats = computed(() => logger.getStats());

const hitRateColor = computed(() => {
  const rate = stats.value.cacheHitRate;
  if (rate >= 80) return '#2ecc71';
  if (rate >= 50) return '#f39c12';
  return '#e74c3c';
});

const cacheUsagePercent = computed(() => {
  const max = 30000;
  return Math.min(100, (stats.value.cacheSize / max) * 100).toFixed(1);
});
</script>

<template>
  <div class="stats-panel">
    <div class="section-title">翻译引擎统计</div>

    <!-- 规则统计 -->
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

    <!-- 缓存统计 -->
    <div
      class="section-title"
      style="margin-top: 16px;"
    > 缓存状态</div>
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
      <div class="log-stat-item info">
        <span class="dot"></span> 信息: {{ logStats.info }}
      </div>
      <div class="log-stat-item success">
        <span class="dot"></span> 成功: {{ logStats.success }}
      </div>
      <div class="log-stat-item warning">
        <span class="dot"></span> 警告: {{ logStats.warning }}
      </div>
      <div class="log-stat-item error">
        <span class="dot"></span> 错误: {{ logStats.error }}
      </div>
    </div>

    <!-- AI 状态 -->
    <div
      class="section-title"
      style="margin-top: 16px;"
    >AI 翻译</div>
    <div class="ai-status">
      <div class="ai-stat">
        <span class="label">缓存条目:</span>
        <span class="value">{{ stats.aiCache.size }}</span>
      </div>
      <div class="ai-stat">
        <span class="label">进行中:</span>
        <span class="value">{{ stats.aiCache.pending }}</span>
      </div>
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

/* ===== 进度条 ===== */
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

/* ===== 日志统计 ===== */
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

/* ===== AI 状态 ===== */
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
</style>