<script setup lang="ts">
import { computed, ref } from 'vue'
import { useHistory } from '../../composables/useHistory'
import { useLibrary } from '../../composables/useLibrary'

const history = useHistory()
const library = useLibrary()
const editingIndex = ref<number | null>(null)
const editingName = ref('')
const busy = ref(false)

const activeId = computed(() => library.activeId.value)
const entries = computed(() =>
  history.records.value
    .map((node, index) => ({ node, index }))
    .reverse(),
)

function beginRename(index: number, name: string) {
  editingIndex.value = index
  editingName.value = name
}

async function saveRename(index: number) {
  if (!activeId.value) return
  await history.renameNode(activeId.value, index, editingName.value)
  editingIndex.value = null
}

async function jump(index: number) {
  if (!activeId.value || busy.value || editingIndex.value !== null) return
  busy.value = true
  try {
    await history.jumpTo(activeId.value, index)
  } finally {
    busy.value = false
  }
}

async function clearAbove(index: number) {
  if (!activeId.value || busy.value || index >= history.records.value.length - 1) return
  if (!window.confirm('删除此步骤之后的历史记录？当前照片参数不会被删除。')) return
  busy.value = true
  try {
    await history.clearAbove(activeId.value, index)
  } finally {
    busy.value = false
  }
}

async function clearAll() {
  if (!activeId.value || busy.value) return
  if (!window.confirm('清空当前照片的历史记录，并保留当前状态作为新的导入节点？')) return
  busy.value = true
  try {
    await history.clearAll(activeId.value)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mobile-history-panel">
    <header class="history-intro">
      <div>
        <p class="eyebrow">EDIT HISTORY</p>
        <h3>当前照片的编辑记录</h3>
      </div>
      <button class="history-clear" :disabled="!activeId || busy" @click="clearAll">清空记录</button>
    </header>

    <p v-if="!activeId" class="history-empty">先从图库选择一张照片。</p>
    <p v-else-if="!history.records.value.length" class="history-empty">还没有可显示的编辑记录。</p>
    <ol v-else class="history-list" aria-label="编辑历史记录">
      <li
        v-for="{ node, index } in entries"
        :key="node.id"
        class="history-item"
        :class="{ current: index === history.cursor.value }"
      >
        <button class="history-step" :disabled="busy || editingIndex !== null" @click="jump(index)">
          <span class="history-step-dot" aria-hidden="true" />
          <span class="history-step-copy">
            <strong v-if="editingIndex !== index">{{ node.name }}</strong>
            <input
              v-else
              v-model="editingName"
              class="history-name-input"
              aria-label="历史步骤名称"
              @click.stop
              @keydown.enter.prevent="saveRename(index)"
              @keydown.esc.prevent="editingIndex = null"
            />
            <small>{{ new Date(node.ts).toLocaleString('zh-CN', { hour12: false }) }}</small>
          </span>
          <span v-if="index === history.cursor.value" class="history-current">当前</span>
        </button>
        <div class="history-actions">
          <button v-if="editingIndex !== index" class="history-action" :disabled="busy" @click="beginRename(index, node.name)">改名</button>
          <button v-else class="history-action primary" :disabled="busy" @click="saveRename(index)">保存</button>
          <button class="history-action danger" :disabled="busy || index >= history.records.value.length - 1" @click="clearAbove(index)">删后续</button>
        </div>
      </li>
    </ol>
    <p class="history-note">每张照片和虚拟副本各自保存历史；切换照片不会互相覆盖。</p>
  </div>
</template>

<style scoped>
.mobile-history-panel { padding: 2px 0 18px; color: #e8eef8; }
.history-intro { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.eyebrow { color: #8b5cf6; font-size: 10px; font-weight: 700; letter-spacing: .14em; line-height: 16px; }
.history-intro h3 { margin-top: 2px; color: #f7f9fd; font-size: 17px; line-height: 24px; }
.history-clear, .history-action { min-height: 44px; padding: 0 12px; border: 1px solid #34425e; border-radius: 10px; color: #cbd6e6; background: #202d44; font-size: 13px; }
.history-clear:disabled, .history-action:disabled { opacity: .45; cursor: not-allowed; }
.history-empty { padding: 26px 4px; color: #98a8c0; font-size: 14px; line-height: 22px; }
.history-list { display: grid; gap: 8px; padding: 0; list-style: none; }
.history-item { display: grid; gap: 6px; padding: 8px; border: 1px solid #2d3c57; border-radius: 13px; background: #18243a; }
.history-item.current { border-color: #8b5cf6; background: #1d2943; }
.history-step { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; padding: 0 4px; border: 0; color: inherit; background: transparent; text-align: left; }
.history-step:disabled { cursor: default; }
.history-step-dot { width: 10px; height: 10px; flex: none; border: 2px solid #70809a; border-radius: 50%; }
.history-item.current .history-step-dot { border-color: #a78bfa; background: #a78bfa; box-shadow: 0 0 0 3px rgba(167, 139, 250, .17); }
.history-step-copy { display: grid; min-width: 0; gap: 2px; }
.history-step-copy strong { overflow: hidden; color: #eef3fb; font-size: 14px; line-height: 20px; text-overflow: ellipsis; white-space: nowrap; }
.history-step-copy small { color: #91a0b5; font-size: 11px; line-height: 16px; }
.history-current { margin-left: auto; flex: none; color: #c4b5fd; font-size: 12px; }
.history-actions { display: flex; justify-content: flex-end; gap: 8px; }
.history-action { min-height: 40px; background: #202d44; }
.history-action.primary { color: #fff; background: #7c3aed; border-color: #8b5cf6; }
.history-action.danger { color: #f4c5c5; }
.history-name-input { width: min(250px, 60vw); min-height: 40px; padding: 7px 9px; border: 1px solid #8b5cf6; border-radius: 8px; color: #f7f9fd; background: #0f1728; font: inherit; outline: none; }
.history-note { margin-top: 14px; color: #8192aa; font-size: 12px; line-height: 19px; }
button { cursor: pointer; touch-action: manipulation; }
button:focus-visible, input:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }
</style>

