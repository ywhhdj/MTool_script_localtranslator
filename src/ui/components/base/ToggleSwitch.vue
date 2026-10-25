<script setup lang="ts">
type Size = 'sm' | 'md' | 'lg';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  disabled?: boolean;
  size?: Size;
  activeColor?: string;
  inactiveColor?: string;
  thumbColor?: string;
}>(), {
  disabled: false,
  size: 'md',
  activeColor: '#197dea',
  inactiveColor: '#ccc',
  thumbColor: '#fff',
});

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'change', v: boolean): void;
}>();

const onChange = (e: Event) => {
  const v = (e.target as HTMLInputElement).checked;
  emit('update:modelValue', v);
  emit('change', v);
};
</script>

<template>
  <label
    class="toggle-switch"
    :class="[`size-${size}`, { disabled }]"
  >
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="onChange"
    />
    <span
      class="track"
      :style="{ background: modelValue ? activeColor : inactiveColor }"
    ></span>
    <span
      class="thumb"
      :style="{ background: thumbColor }"
    ></span>
  </label>
</template>

<style scoped>
.toggle-switch {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
}

.toggle-switch.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  transition: background 0.25s;
}

.thumb {
  position: absolute;
  border-radius: 50%;
  transition: transform 0.25s;
}

.size-sm {
  width: 34px;
  height: 18px;
}

.size-sm .thumb {
  width: 12px;
  height: 12px;
  left: 3px;
  top: 3px;
}

.size-sm input:checked~.thumb {
  transform: translateX(16px);
}

.size-md {
  width: 42px;
  height: 22px;
}

.size-md .thumb {
  width: 16px;
  height: 16px;
  left: 3px;
  top: 3px;
}

.size-md input:checked~.thumb {
  transform: translateX(20px);
}

.size-lg {
  width: 42px;
  height: 24px;
}

.size-lg .thumb {
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
}

.size-lg input:checked~.thumb {
  transform: translateX(18px);
}
</style>