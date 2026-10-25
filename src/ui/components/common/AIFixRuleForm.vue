<script setup lang="ts">
import { ref } from 'vue';
import { translator, logger } from '../../../core';
import { LogLevel } from '../../../typings/enum';

const props = withDefaults(defineProps<{ title?: string }>(), {
  title: '➕ 手动添加 AI 翻译修正规则',
});

const emit = defineEmits<{ (e: 'added'): void }>();

const newAaa = ref('');
const newBbb = ref('');
const newCcc = ref('');
const isRegex = ref(false);

/** 解析 /pattern/flags 形式；非法则抛错 */
const parsePattern = (raw: string, tag: string): string | RegExp => {
  if (!raw) return raw;
  const m = raw.match(/^\/(.+?)\/([gimsuy]*)$/);
  if (!m) return raw;
  try {
    const flags = m[2] || 'g';
    return new RegExp(m[1], flags.includes('g') ? flags : flags + 'g');
  } catch (e: any) {
    throw new Error(`${tag} 正则解析失败: ${e.message}`);
  }
};

const addRule = () => {
  const aaaText = newAaa.value.trim();
  const cccText = newCcc.value.trim();
  if (!aaaText) {
    logger.addLog('aaa (原文/正则) 不能为空', LogLevel.WARNING);
    return;
  }
  if (!cccText) {
    logger.addLog('ccc (替换结果) 不能为空', LogLevel.WARNING);
    return;
  }

  let aaa: string | RegExp = aaaText;
  let bbb: string | RegExp = newBbb.value.trim();

  if (isRegex.value) {
    try {
      aaa = parsePattern(aaaText, 'aaa');
      bbb = parsePattern(bbb as string, 'bbb');
    } catch (e: any) {
      logger.addLog(e.message, LogLevel.ERROR);
      return;
    }
  }

  translator.addAIFixRule(aaa, bbb, cccText);
  newAaa.value = '';
  newBbb.value = '';
  newCcc.value = '';
  logger.addLog('AI 修正规则已添加', LogLevel.SUCCESS);
  emit('added');
};
</script>

<template>
  <div class="add-section">
    <div class="section-title">{{ title }}</div>
    <div class="form-row">
      <label>aaa (原文/正则):</label>
      <input
        v-model="newAaa"
        placeholder="原文或 /正则/"
        class="form-input"
      />
    </div>
    <div class="form-row">
      <label>bbb (AI译文匹配):</label>
      <input
        v-model="newBbb"
        placeholder="留空=不检查AI译文"
        class="form-input"
      />
    </div>
    <div class="form-row">
      <label>ccc (替换结果):</label>
      <input
        v-model="newCcc"
        placeholder="替换后的文本"
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
</template>

<style scoped>


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
</style>