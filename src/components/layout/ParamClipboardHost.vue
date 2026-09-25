<script setup lang="ts">
// 参数剪贴板弹窗宿主（全局唯一挂载于 App.vue）：
// 粘贴确认 + 同步/粘贴结果弹窗。状态在 useParamClipboard 模块单例中，
// 编辑页底栏与胶片条右键菜单触发同一套弹窗，避免各组件重复挂载。
import { useParamClipboard } from '../../composables/useParamClipboard'
import GlassModal from '../common/GlassModal.vue'
import ModuleSelection from '../common/ModuleSelection.vue'
import { ref, watch, nextTick } from 'vue'

const { syncTargets, pasteConfirmOpen, syncResultOpen, syncResultMsg, confirmPaste, doApplyPasted } =
  useParamClipboard()
const clip = useParamClipboard()
const dialog = ref<HTMLDialogElement>()
watch(clip.copyOpen, async open => { await nextTick(); if (open) dialog.value?.showModal(); else dialog.value?.close() })
async function copy() {
  const ok = await clip.copyParams()
  if (ok) clip.copyOpen.value = false
  clip.showResult(ok ? '已复制所选模块，可粘贴到其他照片。' : '复制失败，请检查剪贴板权限。')
}
</script>

<template>
  <dialog ref="dialog" class="workflow-dialog" aria-label="复制参数模块" @close="clip.copyOpen.value = false">
    <h2>复制参数</h2><p>只复制勾选的模块，粘贴时其他模块保持原样。</p>
    <ModuleSelection v-model="clip.copyModules.value" />
    <div class="workflow-actions"><button @click="clip.copyOpen.value = false">取消</button><button :disabled="!clip.copyModules.value.length" @click="copy">复制所选模块</button></div>
  </dialog>
  <!-- 粘贴参数确认（存在勾选目标时） -->
  <GlassModal
    v-model="pasteConfirmOpen"
    title="粘贴参数"
    :message="`将把粘贴的参数应用到当前照片，并同步到已选中的 ${syncTargets.length} 张照片（各照片保留自身 EXIF 信息，可在各自历史中撤销）。确定继续？`"
    confirm-text="应用"
    cancel-text="仅当前照片"
    @confirm="confirmPaste"
    @cancel="doApplyPasted"
  />
  <GlassModal v-model="syncResultOpen" title="同步完成" :message="syncResultMsg" confirm-text="知道了" />
</template>
