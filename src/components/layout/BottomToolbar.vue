<script setup lang="ts">
// 底部上层工具栏：撤销/重做（常驻快捷入口，不再折叠在左栏面板内）+ 缩放 + 同步设置。
// 同步设置（对标 LrC「同步设置」）：把当前照片的全部装饰设置复制到图库中
// Ctrl/Shift 多选的其他照片（每张照片历史链各记一条「同步设置」节点，可撤销）。
// 参数复制/粘贴逻辑在 useParamClipboard（与胶片条右键菜单共享；弹窗由 ParamClipboardHost 渲染）。
import { computed, ref } from 'vue'
import { useViewer } from '../../composables/useViewer'
import { useHistory, applyModulesToPhotos } from '../../composables/useHistory'
import { useLibrary } from '../../composables/useLibrary'
import { pickModules, type ConfigModule } from '../../core/configModules'
import ModuleSelection from '../common/ModuleSelection.vue'
import PhotoSelection from '../common/PhotoSelection.vue'
import { useParamClipboard } from '../../composables/useParamClipboard'
import { useFrameConfig } from '../../composables/useFrameConfig'
import GlassModal from '../common/GlassModal.vue'

const viewer = useViewer()
const history = useHistory()
const library = useLibrary()
const syncDialog = ref<HTMLDialogElement>()
const modules = ref<ConfigModule[]>(['creative'])
const busy = ref(false)
const error = ref('')
const clip = useParamClipboard()
const { state } = useFrameConfig()

// canUndo/canRedo 是普通函数：包一层 computed 以建立响应式依赖（内部读 cursor/records）
const canUndo = computed(() => history.canUndo())
const canRedo = computed(() => history.canRedo())

function zoomIn() {
  viewer.zoomBy(0.2)
}
function zoomOut() {
  viewer.zoomBy(-0.2)
}
function fitView() {
  viewer.resetView()
}

// ===== 同步设置（LR 式）：当前照片设置 → 多选照片 =====
// 目标 = 图库中已多选的其他照片；未多选时按钮禁用并提示操作方式。
const syncTargets = clip.syncTargets
const syncConfirmOpen = ref(false)

function askSyncSettings() {
  error.value = ''
  syncDialog.value?.showModal()
}

async function doSyncSettings() {
  const ids = syncTargets.value.map((i) => i.id)
  if (!ids.length || !modules.value.length || busy.value) return
  busy.value = true
  // toTemplateConfig 剔除照片专属字段（位置/裁剪/EXIF 语义文本等），仅同步装饰设置；
  // applyTemplateToPhotos 会为每张照片保留其自身 EXIF 并自适应文字/Logo 颜色。
  try {
    await applyModulesToPhotos(ids, pickModules(state, modules.value), '同步所选模块')
    syncDialog.value?.close()
    clip.showResult(`已同步 ${ids.length} 张照片；每张可独立撤销，其他模块不变。`)
  } catch (e) { error.value = String(e) } finally { busy.value = false }
}

// ===== 参数复制 / 粘贴（共享逻辑见 useParamClipboard） =====
const flashMsg = ref('')

async function onCopyParams() {
  clip.requestCopy()
}

function onPasteParams() {
  // 审查报告 U8：补兜底——粘贴流程内部含确认弹窗，异常不应成为 unhandledrejection
  void clip.pasteParams().catch((e) => {
    window.alert('粘贴失败：' + ((e as Error)?.message ?? e))
  })
}
</script>

<template>
  <div class="bottom-bar">
    <div class="group">
      <button class="tool" :disabled="!canUndo" title="撤销 (Ctrl+Z)" @click="history.undo()">↶ 撤销</button>
      <button class="tool" :disabled="!canRedo" title="重做 (Ctrl+Shift+Z)" @click="history.redo()">↷ 重做</button>
      <span class="sep" />
      <button
        class="tool"
        :disabled="!library.activeId.value"
        :title="syncTargets.length
          ? `把当前照片的相框/背景/INFO 设置同步到已选中的 ${syncTargets.length} 张照片`
          : '选择目标照片和要同步的模块'"
        @click="askSyncSettings"
      >⇉ 同步设置</button>
      <span v-if="syncTargets.length" class="sync-count">{{ syncTargets.length }}</span>
      <span class="sep" />
      <button
        class="tool"
        title="复制当前照片的相框 / 背景 / INFO 参数到剪贴板（可粘贴到其它照片或跨窗口使用）"
        @click="onCopyParams"
      >⧉ 复制参数</button>
      <button
        class="tool"
        title="粘贴之前复制的参数到当前照片（存在勾选照片时将询问是否一并同步）"
        @click="onPasteParams"
      >📋 粘贴参数</button>
      <span v-if="flashMsg" class="flash-msg">{{ flashMsg }}</span>
    </div>

    <div class="group right">
      <span class="lbl">缩放</span>
      <button class="tool" @click="zoomOut">−</button>
      <span class="zoom-val">{{ Math.round(viewer.zoom.value * 100) }}%</span>
      <button class="tool" @click="zoomIn">＋</button>
      <button class="tool" @click="fitView">适配</button>
    </div>
  </div>

  <dialog ref="syncDialog" class="workflow-dialog" aria-label="同步设置" @cancel="busy && $event.preventDefault()">
    <h2>同步当前照片的设置</h2><p>源照片：{{ library.items.find(p => p.id === library.activeId.value)?.name }}</p>
    <ModuleSelection v-model="modules" />
    <PhotoSelection :exclude-id="library.activeId.value" />
    <p role="alert">{{ error }}</p>
    <div class="workflow-actions"><button :disabled="busy" @click="syncDialog?.close()">取消</button><button :disabled="busy || !syncTargets.length || !modules.length" @click="doSyncSettings">{{ busy ? '正在保存…' : `同步到 ${syncTargets.length} 张` }}</button></div>
  </dialog>

  <!-- 同步设置确认（粘贴确认/结果弹窗在 ParamClipboardHost 全局渲染） -->
  <GlassModal
    v-model="syncConfirmOpen"
    title="同步设置"
    :message="`将把当前照片的相框 / 背景 / INFO 样式同步到已选中的 ${syncTargets.length} 张照片（各照片保留自身 EXIF 信息，可在各自历史中撤销）。确定继续？`"
    confirm-text="同步"
    cancel-text="取消"
    @confirm="doSyncSettings"
  />
</template>

<style scoped>
.bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 26px;
  padding: 0 12px;
  background: var(--shell);
  border-bottom: 1px solid var(--border);
  flex-wrap: nowrap;
  overflow: hidden;
  font-size: 12px;
  line-height: 16px;
}
.group {
  display: flex;
  align-items: center;
  gap: 2px;
}
.group.right {
  flex: none;
}
.sep {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 4px;
}
.lbl {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-dim);
  margin-right: 2px;
  line-height: 16px;
}
.tool {
  background: var(--panel-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 0;
  padding: 0 8px;
  height: 20px;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  cursor: pointer;
  white-space: nowrap;
}
.tool:hover {
  background: var(--hover);
  color: var(--text-normal);
}
.tool.on {
  background: var(--accent);
  color: var(--text-dim);
  border-color: var(--accent);
}
.tool:active { background: var(--pressed); }
.tool:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.sync-count {
  min-width: 18px;
  text-align: center;
  font-size: 11px;
  color: var(--text-num);
  background: var(--panel-3);
  border: 1px solid var(--border);
  line-height: 14px;
  padding: 1px 0;
}
.flash-msg {
  font-size: 11px;
  color: var(--text-num);
  background: var(--panel-3);
  border: 1px solid var(--border);
  line-height: 14px;
  padding: 1px 6px;
  white-space: nowrap;
}
.zoom-val {
  font-size: 12px;
  color: var(--text-num);
  min-width: 42px;
  text-align: center;
  line-height: 16px;
}
</style>
