<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import mootHook from '../core/mootHook';
import translator from '../core/translator';
import logger, { LogLevel } from '../core/logger';
import Icon from './Icon.vue';
import config from '../config';

const stats = ref({
  enabled: config.user.mootHookEnabled?.userConfig ?? false,
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
  if (stats.value.enabled) {
    mootHook.uninstall();
    stats.value.enabled = false;
    logger.addLog('[Moot] Hook 已禁用', LogLevel.WARNING);
  } else {
    mootHook.install({
      apiUrl: config.user.mootApiUrl?.userConfig,
      interceptRequest: true,
      processResponse: true,
      debug: config.user.mootDebug?.userConfig ?? false,
    });
    stats.value.enabled = true;
    refreshStats();
    logger.addLog('[Moot] Hook 已启用', LogLevel.SUCCESS);
  }
  // 同步配置
  if (config.user.mootHookEnabled) {
    config.user.mootHookEnabled.userConfig = stats.value.enabled;
  }
};

const refreshStats = () => {
  stats.value = { ...mootHook.getStats() };
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
  if (!stats.value.enabled) {
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
    if (stats.value.enabled) refreshStats();
  }, 2000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

// ===== 计算属性 =====

const statusValue = computed(() => {
  return stats.value.enabled ? '✅ 运行中' : '⏸ 已停止';
});

const learnedCount = computed(() => {
  const s = translator.stats;
  return s.aiLearnedCount || 0;
});

const totalCacheSize = computed(() => {
  return translator.stats.cacheSize || 0;
});

const cacheIntegrationRate = computed(() => {
  const total = stats.value.responsesSeen;
  if (total === 0) return '0%';
  const learned = stats.value.responsesLearned;
  return ((learned / total) * 100).toFixed(1) + '%';
});

const statusCardClass = computed(() => ({
  active: stats.value.enabled,
}));
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
          :checked="stats.enabled"
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

    <!-- 缓存集成状态 -->
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
      <div style="display: flex; align-items: center; gap: 4px;">
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
        :disabled="stats.enabled"
      >
      <div class="form-hint">启用后不可修改，需先禁用再改</div>
    </div>

    <!-- 调试模式 -->
    <div class="form-section">
      <label class="checkbox-label">
        <input
          v-model="config.user.mootDebug.userConfig"
          type="checkbox"
          :disabled="stats.enabled"
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
      <span class="file-hint">支持 .json / .csv / .tsv / .xlsx（三列格式）</span>
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

/* ===== 缓存集成 ===== */
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