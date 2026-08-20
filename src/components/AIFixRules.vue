<script setup lang="ts">
import { ref, computed } from 'vue';
import translator from '../core/translator';
import logger, { LogLevel } from '../core/logger';
import Icon from './Icon.vue';
import { download } from '../utils';

const fileInput = ref<HTMLInputElement | null>(null);
const newAaa = ref('');
const newBbb = ref('');
const newCcc = ref('');
const isRegex = ref(false);
const rules = computed(() => translator.aiFixRules);

const triggerUpload = () => {
  fileInput.value?.click();
};

const handleFile = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  await translator.loadAIFixRules(file);
  input.value = '';
};

const addRule = () => {
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

  translator.addAIFixRule(aaa, bbb, newCcc.value);
  newAaa.value = '';
  newBbb.value = '';
  newCcc.value = '';
  logger.addLog('AI 修正规则已添加', LogLevel.SUCCESS);
};

const removeRule = (index: number) => {
  translator.clearAIFixRules();
  translator.aiFixRules.forEach((r: any, i: number) => {
    if (i !== index) translator.addAIFixRule(r.aaa, r.bbb, r.ccc);
  });
};

const exportJSON = async () => {
  const { data, fileName } = translator.exportAIFixRules('json');
  await download(data, fileName, 'json');
};

const exportCSV = async () => {
  const { data, fileName } = translator.exportAIFixRules('csv');
  await download(data, fileName, 'csv');
};

const clearAll = () => {
  if (confirm('确定清空所有 AI 修正规则？')) {
    translator.clearAIFixRules();
  }
};

const formatPattern = (val: any): string => {
  if (val instanceof RegExp) return `/${val.source}/${val.flags}`;
  return String(val || '');
};

const fileType = computed(() => {
  return ['json', 'csv', 'tsv', 'xlsx', 'xls'].map(type => `.${type}`).join(',');
});
</script>

<template>
  <div class="ai-fix-panel">
    <!-- 说明 -->
    <div class="ai-fix-info">
      <p>AI 翻译后修正规则：原文匹配 <code>aaa</code> 且 AI 译文包含 <code>bbb</code> 时，替换为 <code>ccc</code></p>
      <p class="hint">bbb 留空 = 仅匹配 aaa 即替换（不检查 AI 译文内容）</p>
    </div>

    <!-- 上传区域 -->
    <div class="upload-section">
      <button
        class="upload-btn"
        @click="triggerUpload"
      >
        <Icon icon="upload" /> 加载规则文件 (JSON/CSV/TSV/XLSX)
      </button>
      <input
        ref="fileInput"
        type="file"
        :accept="fileType"
        style="display:none"
        @change="handleFile"
      />
      <div class="export-btns">
        <button
          class="exp-btn"
          @click="exportJSON"
        >导出JSON</button>
        <button
          class="exp-btn"
          @click="exportCSV"
        >导出CSV</button>
        <button
          class="exp-btn danger"
          @click="clearAll"
        >清空</button>
      </div>
    </div>

    <!-- 手动添加 -->
    <div class="add-section">
      <div class="section-title">➕ 手动添加规则</div>
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
          @click="addRule"
        >添加规则</button>
      </div>
    </div>

    <!-- 规则列表 -->
    <div class="rules-section">
      <div class="section-title">
        📋 规则列表 ({{ rules.length }} 条)
      </div>
      <div
        class="rules-list"
        v-if="rules.length > 0"
      >
        <div
          v-for="(rule, idx) in rules"
          :key="idx"
          class="rule-card"
        >
          <div class="rule-header">
            <span class="rule-index">#{{ idx + 1 }}</span>
            <span
              class="rule-type"
              :class="{ regex: rule._isRegex }"
            >
              {{ rule._isRegex ? '🔧 正则' : '📝 精确' }}
            </span>
            <button
              class="rule-del"
              @click="removeRule(idx)"
            >✕</button>
          </div>
          <div class="rule-body">
            <div class="rule-row">
              <span class="rule-label">aaa:</span>
              <span class="rule-value aaa">{{ formatPattern(rule.aaa) }}</span>
            </div>
            <div class="rule-row">
              <span class="rule-label">bbb:</span>
              <span class="rule-value bbb">{{ formatPattern(rule.bbb) || '(空=不检查)' }}</span>
            </div>
            <div class="rule-row">
              <span class="rule-label">ccc:</span>
              <span class="rule-value ccc">{{ rule.ccc }}</span>
            </div>
          </div>
        </div>
      </div>
      <div
        class="empty-state"
        v-else
      >
        <p>暂无规则，请上传文件或手动添加</p>
        <p class="hint">支持格式：JSON [{aaa,bbb,ccc}] / CSV(三列) / CollData.json</p>
      </div>
    </div>

    <!-- 匹配流程说明 -->
    <div class="flow-section">
      <div class="section-title">🔄 匹配流程</div>
      <div class="flow-diagram">
        <div class="flow-step">原文<br /><small>あははっ情報ありがとう♪</small></div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">MTool AI<br /><small>啊哈哈 谢谢情报♪</small></div>
        <div class="flow-arrow">→</div>
        <div class="flow-step fix">aiFixRules<br /><small>检查 aaa+bbb → 替换 ccc</small></div>
        <div class="flow-arrow">→</div>
        <div class="flow-step final">最终文本<br /><small>交给游戏引擎</small></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-fix-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-fix-info {
  background: #f0e6ff;
  border: 1px solid #d4b5ff;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 11px;
  color: #6a3fa0;
  line-height: 1.5;
}

.ai-fix-info code {
  background: #e8d5ff;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: monospace;
}

.ai-fix-info .hint {
  font-size: 10px;
  color: #999;
  margin: 4px 0 0 0;
}

/* ===== 上传区域 ===== */
.upload-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.upload-btn {
  padding: 10px;
  background: linear-gradient(135deg, #9b59b6, #8e44ad);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(155, 89, 182, 0.4);
}

.export-btns {
  display: flex;
  gap: 6px;
}

.exp-btn {
  flex: 1;
  padding: 6px;
  border: 1px solid #9b59b6;
  background: #fff;
  color: #9b59b6;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.exp-btn:hover {
  background: #9b59b6;
  color: #fff;
}

.exp-btn.danger {
  border-color: #e74c3c;
  color: #e74c3c;
}

.exp-btn.danger:hover {
  background: #e74c3c;
  color: #fff;
}

/* ===== 手动添加 ===== */
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

/* ===== 规则列表 ===== */
.rules-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rules-list {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rule-card {
  background: #fff;
  border: 1px solid #e8d5ff;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
}

.rule-card:hover {
  box-shadow: 0 2px 8px rgba(155, 89, 182, 0.15);
}

.rule-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #f5f0ff;
  border-bottom: 1px solid #e8d5ff;
}

.rule-index {
  font-size: 10px;
  color: #999;
  font-weight: bold;
}

.rule-type {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: #e8f4fd;
  color: #197dea;
}

.rule-type.regex {
  background: #fff3cd;
  color: #f39c12;
}

.rule-del {
  margin-left: auto;
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  color: #999;
  cursor: pointer;
  font-size: 14px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rule-del:hover {
  background: #fee;
  color: #e74c3c;
}

.rule-body {
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rule-row {
  display: flex;
  gap: 4px;
  font-size: 11px;
  line-height: 1.4;
}

.rule-label {
  color: #999;
  min-width: 30px;
  flex-shrink: 0;
}

.rule-value {
  color: #333;
  word-break: break-all;
  font-family: monospace;
  font-size: 10.5px;
}

.rule-value.aaa {
  color: #197dea;
}

.rule-value.bbb {
  color: #f39c12;
}

.rule-value.ccc {
  color: #2ecc71;
  font-weight: bold;
}

.empty-state {
  text-align: center;
  padding: 20px;
  color: #999;
  font-size: 12px;
}

.empty-state .hint {
  font-size: 10px;
  color: #bbb;
}

/* ===== 流程图 ===== */
.flow-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 10px;
}

.flow-diagram {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.flow-step {
  flex-shrink: 0;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 10px;
  text-align: center;
  min-width: 70px;
  line-height: 1.3;
}

.flow-step small {
  display: block;
  color: #999;
  font-size: 9px;
  margin-top: 2px;
}

.flow-step.fix {
  border-color: #9b59b6;
  background: #f5f0ff;
  color: #6a3fa0;
  font-weight: bold;
}

.flow-step.final {
  border-color: #2ecc71;
  background: #e8f8f0;
  color: #27ae60;
  font-weight: bold;
}

.flow-arrow {
  color: #999;
  font-size: 14px;
  flex-shrink: 0;
}
</style>