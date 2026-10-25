<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  label: string;
  hint?: string;
  value?: number;
  enabled?: boolean;
  showSwitch?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  presets?: number[];
  suffix?: string;
}>(), {
  hint: '',
  /** 数值 */
  value: 1,
  /** 该项开关（showSwitch 为 true 时生效） */
  enabled: true,
  showSwitch: true,
  disabled: false,
  min: 1,
  max: 100,
  step: 1,
  presets: [],
  suffix: '×',
});

const emit = defineEmits<{
  (e: 'update:value', v: number): void;
  (e: 'update:enabled', v: boolean): void;
}>();

const currentValue = computed({
  get: () => Number(props.value) || 0,
  set: (v: number) => emit('update:value', v),
});

const currentEnabled = computed({
  get: () => props.enabled,
  set: (v: boolean) => emit('update:enabled', v),
});

const onInput = (e: Event) => {
  const raw = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(raw)) return;
  currentValue.value = Math.min(props.max, Math.max(props.min, raw));
};

const applyPreset = (v: number) => {
  currentValue.value = Math.min(props.max, Math.max(props.min, v));
};

const valueText = computed(() => {
  const v = currentValue.value;
  return `${v}${props.suffix}`;
});
</script>

<template>
  <div
    class="cheat-row"
    :class="{ off: showSwitch && !enabled, disabled }"
  >
    <div class="row-head">
      <div class="row-label">
        <span class="label-text">{{ label }}</span>
        <span
          class="label-hint"
          v-if="hint"
        >{{ hint }}</span>
      </div>
      <div class="row-controls">
        <span class="value-badge">{{ valueText }}</span>
        <label
          class="mini-switch"
          v-if="showSwitch"
        >
          <input
            type="checkbox"
            v-model="currentEnabled"
            :disabled="disabled"
          >
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <div class="row-body">
      <input
        class="row-slider"
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="currentValue"
        :disabled="disabled || (showSwitch && !enabled)"
        @input="onInput"
      >
      <input
        class="row-number"
        type="number"
        :min="min"
        :max="max"
        :step="step"
        :value="currentValue"
        :disabled="disabled || (showSwitch && !enabled)"
        @change="onInput"
      >
    </div>

    <div
      class="row-presets"
      v-if="presets.length > 0"
    >
      <button
        v-for="p in presets"
        :key="p"
        class="preset-btn"
        :class="{ active: currentValue === p }"
        :disabled="disabled || (showSwitch && !enabled)"
        @click="applyPreset(p)"
      >×{{ p }}</button>
    </div>
  </div>
</template>

<style scoped>
.cheat-row {
  background: #f8f9fa;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: opacity .2s;
}

.cheat-row.off,
.cheat-row.disabled {
  opacity: .55;
}

.row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.row-label {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.label-text {
  font-size: 12px;
  font-weight: 500;
  color: #333;
}

.label-hint {
  font-size: 10px;
  color: #999;
  margin-top: 1px;
}

.row-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.value-badge {
  font-size: 12px;
  font-weight: bold;
  color: #197dea;
  background: #e8f2ff;
  border-radius: 10px;
  padding: 1px 8px;
  min-width: 44px;
  text-align: center;
}

.row-body {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-slider {
  flex: 1;
  accent-color: #197dea;
  min-width: 0;
}

.row-number {
  width: 72px;
  padding: 4px 6px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
}

.row-number:focus {
  border-color: #197dea;
}

.row-presets {
  display: flex;
  gap: 4px;
}

.preset-btn {
  flex: 1;
  padding: 3px 0;
  border: 1px solid #d6e4f5;
  background: #fff;
  color: #197dea;
  border-radius: 5px;
  font-size: 11px;
  cursor: pointer;
  transition: all .15s;
}

.preset-btn:hover {
  background: #e8f2ff;
}

.preset-btn.active {
  background: #197dea;
  color: #fff;
  border-color: #197dea;
}

/* ===== 迷你开关 ===== */
.mini-switch {
  position: relative;
  width: 34px;
  height: 18px;
  flex-shrink: 0;
}

.mini-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.mini-switch .slider {
  position: absolute;
  inset: 0;
  cursor: pointer;
  background: #ccc;
  border-radius: 18px;
  transition: .25s;
}

.mini-switch .slider::before {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: .25s;
}

.mini-switch input:checked+.slider {
  background: #197dea;
}

.mini-switch input:checked+.slider::before {
  transform: translateX(16px);
}

button {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>