<script setup lang="ts">
import { computed } from 'vue';
import translator from '../core/translator';
import aiTranslator from '../core/aiTranslator';
import config from '../config';

const stats = computed(() => {
  try {
    return translator.stats;
  } catch {
    return null;
  }
});

const aiPendingCount = computed(() => {
  try {
    return aiTranslator.pendingCount;
  } catch {
    return 0;
  }
});

const formatNumber = (n: any): string => {
  const num = Number(n) || 0;
  return num.toLocaleString();
};

const formatPercent = (n: any): string => {
  const num = Number(n) || 0;
  return `${num}%`;
};
</script>

<template>
  <div
    class="stats-panel"
    v-if="stats"
  >
    <!-- 总览卡片 -->
    <div class="stats-grid">
      <div class="stat-card primary">
        <div class="stat-value">{{ formatNumber(stats.rules) }}</div>
        <div class="stat-label">总规则数</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">{{ formatPercent(stats.cacheHitRate) }}</div>
        <div class="stat-label">缓存命中率</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-value">{{ formatNumber(stats.cacheSize) }}</div>
        <div class="stat-label">缓存条目</div>
      </div>
      <div class="stat-card info">
        <div class="stat-value">{{ formatNumber(stats.aiLearnedCount) }}</div>
        <div class="stat-label">AI 学习</div>
      </div>
    </div>

    <!-- 详细表格 -->
    <div class="stats-section">
      <div class="section-title">详细统计</div>
      <table class="stats-table">
        <tbody>
          <tr>
            <td>精确规则</td>
            <td>{{ formatNumber(stats.exactRules) }}</td>
          </tr>
          <tr>
            <td>正则规则</td>
            <td>{{ formatNumber(stats.regexRules) }}</td>
          </tr>
          <tr>
            <td>默认规则</td>
            <td>{{ formatNumber(stats.defaultRules) }}</td>
          </tr>
          <tr>
            <td>用户规则</td>
            <td>{{ formatNumber(stats.userRules) }}</td>
          </tr>
          <tr>
            <td>缓存总查询</td>
            <td>{{ formatNumber(stats.cacheTotal) }}</td>
          </tr>
          <tr>
            <td>忽略条目</td>
            <td>{{ formatNumber(stats.ignoreSize) }}</td>
          </tr>
          <tr>
            <td>Bloom 条目</td>
            <td>{{ formatNumber(stats.bloomSize) }} ({{ formatNumber(stats.bloomBytes) }}B)</td>
          </tr>
          <tr v-if="stats.preTranslated">
            <td>预翻译</td>
            <td class="status-ok">✓ 已完成</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- AI 统计 -->
    <div
      class="stats-section"
      v-if="config.user.enableAI.userConfig"
    >
      <div class="section-title">🤖 AI 翻译</div>
      <table class="stats-table">
        <tbody>
          <tr>
            <td>AI 待处理</td>
            <td>{{ formatNumber(aiPendingCount) }}</td>
          </tr>
          <tr>
            <td>AI Fix 规则</td>
            <td>{{ formatNumber(stats.aiFixRules) }}</td>
          </tr>
          <tr>
            <td>AI Fix 命中</td>
            <td>{{ formatNumber(stats.aiFixHits) }}</td>
          </tr>
        </tbody>
      </table>
      <div
        class="last-fix"
        v-if="stats.aiFixLastFix"
      >
        <small>最近修正: {{ stats.aiFixLastFix }}</small>
      </div>
    </div>

    <!-- 压缩统计 -->
    <div
      class="stats-section"
      v-if="stats.compactStats"
    >
      <div class="section-title">🗜 压缩统计</div>
      <table class="stats-table">
        <tbody>
          <tr>
            <td>原始规则</td>
            <td>{{ formatNumber(stats.compactStats.originalCount) }}</td>
          </tr>
          <tr>
            <td>压缩后</td>
            <td>{{ formatNumber(stats.compactStats.compactedCount) }}</td>
          </tr>
          <tr>
            <td>压缩率</td>
            <td>{{ formatPercent(stats.compactStats.compressionRatio) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div
    class="stats-panel"
    v-else
  >
    <p class="loading">加载中...</p>
  </div>
</template>

<style scoped>
.stats-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.stat-card {
  padding: 10px;
  border-radius: 8px;
  text-align: center;
  color: #fff;
}

.stat-card.primary {
  background: linear-gradient(135deg, #197dea, #1559b3);
}

.stat-card.success {
  background: linear-gradient(135deg, #2ecc71, #27ae60);
}

.stat-card.warning {
  background: linear-gradient(135deg, #f39c12, #e67e22);
}

.stat-card.info {
  background: linear-gradient(135deg, #9b59b6, #8e44ad);
}

.stat-value {
  font-size: 20px;
  font-weight: bold;
}

.stat-label {
  font-size: 10px;
  opacity: 0.9;
  margin-top: 2px;
}

.stats-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 10px;
}

.section-title {
  font-size: 12px;
  font-weight: bold;
  color: #555;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid #eee;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.stats-table td {
  padding: 4px 6px;
  border-bottom: 1px solid #f0f0f0;
}

.stats-table td:first-child {
  color: #666;
}

.stats-table td:last-child {
  text-align: right;
  font-weight: bold;
  color: #333;
}

.status-ok {
  color: #2ecc71 !important;
}

.last-fix {
  margin-top: 6px;
  padding: 4px 8px;
  background: #e8f8f0;
  border-radius: 4px;
  font-size: 10px;
  color: #27ae60;
}

.loading {
  text-align: center;
  color: #999;
  padding: 20px;
}
</style>