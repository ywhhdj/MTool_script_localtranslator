<script setup lang="ts">
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import { computed, onMounted, ref, watch } from 'vue'

hljs.registerLanguage(javascript.name, javascript)
hljs.registerAliases(['js', 'jsx'], { languageName: 'javascript' })

const props = withDefaults(defineProps<{
  language?: string
  editable?: boolean
  backgroundColor?: string
  placeholder?: string
}>(), {
  language: 'javascript',
  editable: false,
  backgroundColor: '#282c34',
  placeholder: ''
})

const model = defineModel<string>({ default: '' })

const codeRef = ref<HTMLElement | null>(null)
const isComposing = ref(false)

/** 是否支持 contenteditable="plaintext-only"（保证输入的是纯文本，不会出现 <div>/<br>） */
const plaintextSupported = (() => {
  if (typeof document === 'undefined') return false
  const el = document.createElement('div')
  el.setAttribute('contenteditable', 'plaintext-only')
  return el.contentEditable === 'plaintext-only'
})()

const highlightedCode = computed(() => {
  try {
    const lang = hljs.getLanguage(props.language) ? props.language : 'plaintext'
    return hljs.highlight(model.value, { language: lang }).value
  } catch {
    return model.value
  }
})

/** 读取当前选区在纯文本中的 [start, end] 偏移 */
function getSelectionOffsets(el: HTMLElement): [number, number] {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return [0, 0]
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return [0, 0]

  const pre = range.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(range.startContainer, range.startOffset)
  const start = pre.toString().length

  pre.setEnd(range.endContainer, range.endOffset)
  const end = pre.toString().length

  return [start, end]
}

/** 把光标恢复到纯文本偏移 offset 处 */
function setCaretOffset(el: HTMLElement, offset: number) {
  const sel = window.getSelection()
  if (!sel) return

  const range = document.createRange()
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let current = 0
  let node = walker.nextNode()

  while (node) {
    const len = node.textContent?.length ?? 0
    if (current + len >= offset) {
      range.setStart(node, Math.max(0, offset - current))
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    current += len
    node = walker.nextNode()
  }

  // offset 超出内容，落到末尾
  range.selectNodeContents(el)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** 用高亮结果重绘，并可选恢复光标（offset = -1 表示不恢复） */
function render(offset = -1) {
  const el = codeRef.value
  if (!el) return
  el.innerHTML = highlightedCode.value
  if (offset >= 0 && document.activeElement === el) {
    setCaretOffset(el, offset)
  }
}

/** 替换当前选区（用于 Enter / Tab / 粘贴） */
function replaceRange(text: string) {
  const el = codeRef.value
  if (!el) return
  const [start, end] = getSelectionOffsets(el)
  model.value = model.value.slice(0, start) + text + model.value.slice(end)
  render(start + text.length)
}

/** 普通输入（英文、直接输入） */
function handleInput(e: Event) {
  if (isComposing.value) return

  const el = e.target as HTMLElement
  const text = el.textContent ?? ''
  if (text === model.value) return

  // input 事件触发时选区已折叠，start 即当前光标位置
  const [start] = getSelectionOffsets(el)
  model.value = text
  render(start)
}

/** 拦截 Enter / Tab，避免浏览器插入 <div> / <br>，保证纯文本一致性 */
function handleKeydown(e: KeyboardEvent) {
  if (!props.editable || isComposing.value) return

  if (e.key === 'Enter') {
    e.preventDefault()
    replaceRange('\n')
  } else if (e.key === 'Tab') {
    e.preventDefault()
    replaceRange('  ')
  }
}

/** 粘贴只取纯文本 */
function handlePaste(e: ClipboardEvent) {
  if (!props.editable) return
  e.preventDefault()
  replaceRange(e.clipboardData?.getData('text/plain') ?? '')
}

function handleCompositionStart() {
  isComposing.value = true
}

function handleCompositionEnd(e: CompositionEvent) {
  isComposing.value = false
  const el = e.target as HTMLElement
  const text = el.textContent ?? ''
  const [start] = getSelectionOffsets(el)
  model.value = text
  render(start)
}

// 外部修改 model 时同步 DOM（输入时 DOM 已是新内容，会走 textContent 相等跳过，避免重复重绘）
watch(model, () => {
  const el = codeRef.value
  if (!el) return
  if ((el.textContent ?? '') !== model.value) {
    const offset = document.activeElement === el ? getSelectionOffsets(el)[1] : -1
    render(offset)
  }
})

// 语言切换时重新高亮
watch(() => props.language, () => render())

onMounted(() => render())

function cleanCode() {
  model.value = "";
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(model.value)
  } catch (err) {
    console.error('复制失败:', err)
  }
}
</script>

<template>
  <header class="header">
    <span class="language">{{ language }}</span>
    <div style="display: flex;gap: 10px;">
      <span
        class="btn"
        @click="cleanCode"
      >清空</span>
      <span
        class="btn"
        @click="copyCode"
      >复制</span>
    </div>
  </header>

  <div
    class="hljs"
    :style="{ background: backgroundColor }"
  >
    <div class="code-container">
      <code
        ref="codeRef"
        class="code-content"
        :contenteditable="editable ? (plaintextSupported ? 'plaintext-only' : 'true') : 'false'"
        spellcheck="false"
        :data-placeholder="placeholder"
        @input="handleInput"
        @keydown="handleKeydown"
        @paste="handlePaste"
        @compositionstart="handleCompositionStart"
        @compositionend="handleCompositionEnd"
      />
    </div>
  </div>
</template>

<style scoped>
.hljs {
  margin: 0;
  padding: 0;
  border-radius: 8px;
  width: 100%;
}

.btn {
  background: transparent;
  color: #fff;
  border: none;
  cursor: pointer;
  outline: none;
}

.header {
  border-radius: 10px 10px 0 0;
  padding: 10px 16px 8px 16px;
  border-top: 1px solid #545151;
  border-left: 1px solid #545151;
  border-right: 1px solid #545151;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #303030;
}

.code-container {
  padding: 16px;
  overflow-x: hidden;
  border-left: 1px solid #545151;
  border-right: 1px solid #545151;
  border-bottom: 1px solid #545151;
  overflow-y: auto;
  background-color: #1d1d1d;
  border-radius: 0 0 10px 10px;
}

.hljs,
.code-content {
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: normal;
}

.language {
  color: #fff;
}

.code-content {
  display: block;
  border: none;
  outline: none;
  min-height: 1.5em;
  caret-color: #fff;
  tab-size: 2;
  -moz-tab-size: 2;
}

/* 空内容时显示 placeholder */
.code-content:empty::before {
  content: attr(data-placeholder);
  color: #7d8590;
  pointer-events: none;
}
</style>