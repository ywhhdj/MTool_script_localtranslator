<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import cheat from '../core/cheat';
import { GENERIC_SCRIPT_PRESET } from '../core/cheat/engines/generic';
import logger, { LogLevel } from '../core/logger';
import config from '../config';
import { debounce } from '../utils';
import Icon from './base/Icon.vue';
import CheatRow from './CheatRow.vue';
import Code from './base/Code.vue';

// cheat.settings 是 reactive，直接双向绑定即可
const s = cheat.settings;

const stats = ref(cheat.getStats());
const showScript = ref(false);

const refresh = () => {
  stats.value = cheat.getStats();
};

// 引擎列表：自动 + 注册表里的引擎
const engineOptions = computed(() => {
  void stats.value;
  return [
    {
      key: 'auto' as Options.CheatEngineKey,
      name: '自动检测',
      desc: '按页面环境自动选择可用引擎',
      available: true,
    },
    ...cheat.engines().map((e) => ({
      key: e.key as Options.CheatEngineKey,
      name: e.name,
      desc: e.desc,
      available: e.available,
    })),
  ];
});

const currentKey = computed(() => s.engine);
const engineName = computed(() => {
  void stats.value;
  return cheat.currentEngine()?.name || '未知引擎';
});

const renderOnly = computed(() => {
  void stats.value;
  return cheat.renderOnlyEngines();
});

const supports = (cap: 'gold' | 'actor' | 'item' | 'drop') => {
  void stats.value;
  return cheat.supports(cap);
};

// ==================== 操作 ====================

const autoSave = debounce(() => cheat.saveToStorage(), 400);

// 倍率改动即时生效（补丁内实时读配置），这里只负责落盘
watch(
  () => JSON.stringify(s),
  () => {
    autoSave();
    refresh();
  }
);

const toggleEnabled = (checked: boolean) => {
  cheat.toggle(checked);
  if (config.user.cheatEnabled) {
    config.user.cheatEnabled.userConfig = s.enabled;
  }
  refresh();
};

const applyNow = () => {
  const result = cheat.apply();
  stats.value = result;
  if (result.patched.length === 0) {
    logger.addLog('[Cheat] 未注入任何补丁，请检查引擎与开关', LogLevel.WARNING);
  }
};

const revertNow = () => {
  cheat.revert();
  s.enabled = false;
  if (config.user.cheatEnabled) {
    config.user.cheatEnabled.userConfig = false;
  }
  refresh();
};

const resetAll = () => {
  if (!confirm('确定重置修改器全部配置？')) return;
  cheat.reset();
  refresh();
};

const changeEngine = (key: Options.CheatEngineKey) => {
  cheat.setEngine(key);
  refresh();
};

// ==================== 快捷动作 ====================

const doSetGold = () => {
  cheat.setGold(s.gold.setValue);
};

const doMaxLevel = () => cheat.maxLevel();
const doRecover = () => cheat.recoverAll();
const doGiveItems = () => cheat.giveAllItems(s.item.giveAmount);

const loadPresetScript = () => {
  s.generic.script = GENERIC_SCRIPT_PRESET;
  s.generic.enabled = true;
  logger.addLog('[Cheat] 已载入自定义脚本示例', LogLevel.INFO);
};

onMounted(() => {
  refresh();
  showScript.value = s.engine === 'generic';
});
</script>

<template>
  <div class="cheat-panel">
    <!-- ===== 头部：总开关 ===== -->
    <div class="cheat-header">
      <div class="cheat-title">
        <Icon
          icon="cheat"
          :size="14"
        />
        <span>游戏修改器</span>
      </div>
      <label class="main-switch">
        <input
          type="checkbox"
          :checked="s.enabled"
          @change="toggleEnabled(($event.target as HTMLInputElement).checked)"
        >
        <span class="slider"></span>
      </label>
    </div>

    <!-- ===== 状态条 ===== -->
    <div class="status-bar">
      <div class="status-item">
        <span class="status-label">引擎</span>
        <span class="status-value">{{ engineName }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">注入点</span>
        <span class="status-value">{{ stats.patched.length }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">状态</span>
        <span
          class="status-value"
          :class="{ ok: stats.applied }"
        >{{ stats.applied ? '已生效' : '未生效' }}</span>
      </div>
    </div>

    <div
      class="tip warn"
      v-if="renderOnly.length > 0 && !supports('gold')"
    >
      检测到渲染引擎（{{ renderOnly.join('、') }}）无通用数值接口，已降级为自定义脚本模式
    </div>

    <!-- ===== 引擎选择 ===== -->
    <div class="section-title">引擎</div>
    <div class="engine-list">
      <button
        v-for="eng in engineOptions"
        :key="eng.key"
        class="engine-card"
        :class="{ active: currentKey === eng.key }"
        @click="changeEngine(eng.key)"
      >
        <div class="engine-name">
          {{ eng.name }}
          <span
            class="dot"
            :class="{ on: eng.available }"
          ></span>
        </div>
        <div class="engine-desc">{{ eng.desc }}</div>
      </button>
    </div>

    <!-- ===== 💰 金额 ===== -->
    <div class="section-title">金额</div>
    <div
      class="group"
      :class="{ locked: !supports('gold') }"
    >
      <div
        class="locked-mask"
        v-if="!supports('gold')"
      >当前引擎不支持金额修改，请切换引擎或使用自定义脚本</div>

      <CheatRow
        label="获得金币倍率"
        hint="仅对『获得』生效，消费扣款不受影响"
        :value="s.gold.multiplier"
        :enabled="s.gold.enabled"
        show-switch
        :min="1"
        :max="100"
        :presets="[2, 5, 10, 100]"
        @update:value="s.gold.multiplier = $event"
        @update:enabled="s.gold.enabled = $event"
      />

      <label class="field">
        <span class="field-label">单次最少获得（保底，0 = 关闭）</span>
        <input
          type="number"
          min="0"
          v-model.number="s.gold.minGain"
        >
      </label>

      <label class="field">
        <span class="field-label">金币上限（0 = 引擎默认）</span>
        <input
          type="number"
          min="0"
          v-model.number="s.gold.maxGold"
        >
      </label>

      <div class="quick-row">
        <input
          type="number"
          min="0"
          v-model.number="s.gold.setValue"
        >
        <button
          class="quick-btn"
          @click="doSetGold"
        >直接设为该金币</button>
      </div>
    </div>

    <!-- ===== 角色属性·等级 ===== -->
    <div class="section-title">角色属性·等级</div>
    <div
      class="group"
      :class="{ locked: !supports('actor') }"
    >
      <div
        class="locked-mask"
        v-if="!supports('actor')"
      >当前引擎不支持角色数值修改</div>

      <CheatRow
        label="获得经验倍率"
        hint="Game_Actor.gainExp"
        :value="s.actor.expMultiplier"
        :enabled="s.actor.expEnabled"
        show-switch
        :min="1"
        :max="100"
        :presets="[2, 5, 10, 50]"
        @update:value="s.actor.expMultiplier = $event"
        @update:enabled="s.actor.expEnabled = $event"
      />

      <CheatRow
        label="属性基础值倍率"
        hint="Game_Actor.paramBase"
        :value="s.actor.paramBaseMultiplier"
        :enabled="s.actor.paramEnabled"
        show-switch
        :min="1"
        :max="100"
        :presets="[2, 5, 10, 50]"
        @update:value="s.actor.paramBaseMultiplier = $event"
        @update:enabled="s.actor.paramEnabled = $event"
      />

      <CheatRow
        label="装备加成倍率"
        hint="Game_Actor.paramPlus"
        :value="s.actor.paramPlusMultiplier"
        :enabled="s.actor.paramEnabled"
        show-switch
        :min="1"
        :max="100"
        :presets="[2, 5, 10, 50]"
        @update:value="s.actor.paramPlusMultiplier = $event"
        @update:enabled="s.actor.paramEnabled = $event"
      />

      <label class="field inline">
        <input
          type="checkbox"
          v-model="s.actor.paramMaxEnabled"
        >
        <span class="field-label">参数上限值</span>
        <input
          type="number"
          min="1"
          v-model.number="s.actor.paramMax"
        >
      </label>

      <label class="field inline">
        <input
          type="checkbox"
          v-model="s.actor.levelMaxEnabled"
        >
        <span class="field-label">等级上限</span>
        <input
          type="number"
          min="1"
          v-model.number="s.actor.levelMax"
        >
      </label>

      <div class="quick-row">
        <button
          class="quick-btn"
          @click="doMaxLevel"
        >全队满级</button>
        <button
          class="quick-btn"
          @click="doRecover"
        >全队回满</button>
      </div>
    </div>

    <!-- ===== 🎒 物品获取量 ===== -->
    <div class="section-title">物品获取量</div>
    <div
      class="group"
      :class="{ locked: !supports('item') }"
    >
      <div
        class="locked-mask"
        v-if="!supports('item')"
      >当前引擎不支持物品数值修改</div>

      <CheatRow
        label="获得数量倍率"
        hint="Game_Party.gainItem"
        :value="s.item.multiplier"
        :enabled="s.item.enabled"
        show-switch
        :min="1"
        :max="100"
        :presets="[2, 5, 10, 99]"
        @update:value="s.item.multiplier = $event"
        @update:enabled="s.item.enabled = $event"
      />

      <label class="field">
        <span class="field-label">单格持有上限（0 = 引擎默认 99）</span>
        <input
          type="number"
          min="0"
          v-model.number="s.item.maxItems"
        >
      </label>

      <div class="sub-title">掉落</div>
      <label class="field inline">
        <input
          type="checkbox"
          v-model="s.item.dropEnabled"
        >
        <span class="field-label">启用掉落率修改</span>
      </label>
      <CheatRow
        label="掉落倍率"
        hint="Game_Enemy.dropItemRate"
        :value="s.item.dropMultiplier"
        :enabled="s.item.dropEnabled"
        :min="1"
        :max="100"
        :presets="[2, 5, 10, 50]"
        @update:value="s.item.dropMultiplier = $event"
      />
      <label class="field inline">
        <input
          type="checkbox"
          v-model="s.item.guaranteedDrop"
        >
        <span class="field-label">必定掉落（掉率拉满）</span>
      </label>

      <div class="quick-row">
        <input
          type="number"
          min="1"
          v-model.number="s.item.giveAmount"
        >
        <button
          class="quick-btn"
          @click="doGiveItems"
        >发放全道具</button>
      </div>
    </div>

    <!-- ===== 🧩 自定义脚本 ===== -->
    <div class="section-title">
      <span @click="showScript = !showScript">自定义脚本 {{ showScript ? '▲' : '▼' }}</span>
    </div>
    <div
      class="group"
      v-show="showScript"
    >
      <label class="field inline">
        <input
          type="checkbox"
          v-model="s.generic.enabled"
        >
        <span class="field-label">启用自定义脚本（应用时执行）</span>
      </label>
      <div>
        <Code
          v-model="s.generic.script"
          placeholder="// 可访问 window 上全部全局对象；变量 settings 为当前配置&#10;// 例：Game_Party.prototype.gainGold = function(amount){ ... }"
          editable
          language="javascript"
        />
      </div>
      <div class="quick-row">
        <button
          class="quick-btn"
          @click="loadPresetScript"
        >载入示例</button>
        <button
          class="quick-btn"
          @click="applyNow"
        >执行脚本</button>
      </div>
      <div class="hint-text">
        脚本中的 <code>Xxx.prototype.yyy =</code> 赋值会在执行前自动备份，还原时可写回；其余副作用需刷新页面清除。
      </div>
    </div>

    <!-- ===== 底部操作 ===== -->
    <div class="cheat-actions">
      <button
        class="btn primary"
        @click="applyNow"
      >应用修改</button>
      <button
        class="btn"
        @click="revertNow"
      >还原</button>
      <button
        class="btn ghost"
        @click="resetAll"
      >重置</button>
    </div>

    <div
      class="patched-list"
      v-if="stats.patched.length > 0"
    >
      <div class="patched-title">已注入：</div>
      <div
        class="patched-item"
        v-for="p in stats.patched"
        :key="p"
      >{{ p }}</div>
    </div>
  </div>
</template>

<style scoped>
.cheat-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ===== 头部 ===== */
.cheat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #197dea, #1559b3);
  color: #fff;
  border-radius: 8px;
  padding: 8px 12px;
}

.cheat-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: bold;
}

.main-switch {
  position: relative;
  width: 42px;
  height: 22px;
  flex-shrink: 0;
}

.main-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.main-switch .slider {
  position: absolute;
  inset: 0;
  cursor: pointer;
  background: rgba(255, 255, 255, .4);
  border-radius: 22px;
  transition: .25s;
}

.main-switch .slider::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: .25s;
}

.main-switch input:checked+.slider {
  background: #2ecc71;
}

.main-switch input:checked+.slider::before {
  transform: translateX(20px);
}

/* ===== 状态条 ===== */
.status-bar {
  display: flex;
  gap: 6px;
}

.status-item {
  flex: 1;
  background: #f8f9fa;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 6px 4px;
  text-align: center;
}

.status-label {
  display: block;
  font-size: 10px;
  color: #999;
}

.status-value {
  display: block;
  font-size: 12px;
  font-weight: bold;
  color: #333;
  margin-top: 2px;
}

.status-value.ok {
  color: #2ecc71;
}

/* ===== 分组 ===== */
.section-title {
  font-size: 12px;
  font-weight: bold;
  color: #555;
  padding-bottom: 4px;
  border-bottom: 1px solid #eee;
  user-select: none;
}

.sub-title {
  font-size: 11px;
  color: #888;
  font-weight: bold;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 10px;
  position: relative;
}

.group.locked {
  opacity: .6;
}

.locked-mask {
  font-size: 11px;
  color: #e67e22;
  background: #fff7e8;
  border-radius: 6px;
  padding: 4px 8px;
}

/* ===== 引擎选择 ===== */
.engine-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.engine-card {
  text-align: left;
  border: 1px solid #eee;
  background: #f8f9fa;
  border-radius: 8px;
  padding: 7px 10px;
  cursor: pointer;
  transition: all .2s;
}

.engine-card:hover {
  border-color: #197dea;
}

.engine-card.active {
  border-color: #197dea;
  background: #e8f2ff;
}

.engine-name {
  font-size: 12px;
  font-weight: 500;
  color: #333;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ccc;
}

.dot.on {
  background: #2ecc71;
}

.engine-desc {
  font-size: 10px;
  color: #999;
  margin-top: 2px;
}

/* ===== 表单 ===== */
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
}

.field.inline {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.field-label {
  color: #555;
  white-space: nowrap;
}

.field input[type="number"],
.field input[type="text"] {
  padding: 5px 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
  width: 100%;
  min-width: 0;
}

.field.inline input[type="number"] {
  width: 96px;
  flex-shrink: 0;
  margin-left: auto;
}

.field input:focus {
  border-color: #197dea;
}

textarea {
  width: 100%;
  min-height: 150px;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 8px;
  font-size: 11px;
  font-family: Consolas, Monaco, monospace;
  line-height: 1.5;
  resize: vertical;
  outline: none;
}

textarea:focus {
  border-color: #197dea;
}

/* ===== 快捷操作 ===== */
.quick-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.quick-row input[type="number"] {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
  min-width: 0;
}

.quick-btn {
  padding: 6px 10px;
  border: 1px solid #197dea;
  background: #fff;
  color: #197dea;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}

.quick-btn:hover {
  background: #197dea;
  color: #fff;
}

/* ===== 底部 ===== */
.cheat-actions {
  display: flex;
  gap: 8px;
}

.btn {
  flex: 1;
  padding: 8px;
  border: 1px solid #ddd;
  background: #fff;
  color: #555;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
}

.btn.primary {
  flex: 2;
  background: #197dea;
  border-color: #197dea;
  color: #fff;
  font-weight: bold;
}

.btn.primary:hover {
  background: #0d6efd;
}

.btn.ghost {
  color: #999;
}

/* ===== 提示 ===== */
.tip {
  font-size: 11px;
  border-radius: 6px;
  padding: 5px 8px;
}

.tip.warn {
  background: #fff7e8;
  color: #e67e22;
}

.hint-text {
  font-size: 10px;
  color: #999;
  line-height: 1.5;
}

.hint-text code {
  background: #f0f0f0;
  border-radius: 3px;
  padding: 0 3px;
}

/* ===== 已注入清单 ===== */
.patched-list {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 6px 8px;
}

.patched-title {
  font-size: 10px;
  color: #888;
  margin-bottom: 3px;
}

.patched-item {
  font-size: 10px;
  color: #555;
  font-family: Consolas, Monaco, monospace;
  word-break: break-all;
}

button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
</style>
