<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { registerMobileBackHandler } from '../../platform/mobileBack'
import { saveAllPending } from '../../composables/useHistory'
import { collectBackupUI, mobileDocument, prepareBackupRestore, commitBackupRestore, finishPendingRestore, type BackupPreview } from '../../platform/mobileBackup'
const dialog = ref<HTMLDialogElement>()
const busy = ref(false)
const status = ref('')
const error = ref('')
const preview = ref<BackupPreview | null>(null)
const removeBack = registerMobileBackHandler(() => {
  if (!dialog.value?.open) return false
  void close()
  return true
})
onBeforeUnmount(removeBack)
function open() { status.value = ''; error.value = ''; dialog.value?.showModal() }
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await saveAllPending(); await action() }
  catch (e) { error.value = String(e instanceof Error ? e.message : e); status.value = '' }
  finally { busy.value = false }
}
function backup() { void run(async () => {
  status.value = '请选择保存位置，写入完成前请保持应用打开…'
  const result = await mobileDocument<{ photos: number } | null>('backupExport', {
    filename: `水印小屋-${new Date().toISOString().slice(0, 10)}.framelab.zip`, ui: await collectBackupUI(),
  })
  status.value = result ? `备份已保存，包含 ${result.photos} 张原图及编辑记录。` : '已取消，没有创建备份。'
}) }
function restore() { void run(async () => {
  status.value = '请选择备份，正在校验文件…'
  preview.value = await prepareBackupRestore()
  status.value = preview.value ? '' : '已取消，现有作品未改动。'
}) }
function confirmRestore() { void run(async () => {
  if (!preview.value) return
  status.value = '正在追加恢复，请勿关闭应用…'
  const token = preview.value.token
  // Once commit begins, retry only the pending UI payload, never duplicate the photo transaction.
  preview.value = null
  await commitBackupRestore(token)
  location.reload()
}) }
function retry() { void run(async () => {
  if (await finishPendingRestore()) location.reload()
  else status.value = '没有待完成的恢复；现有作品保持不变。'
}) }
async function close() {
  if (busy.value) return
  if (preview.value) {
    const token = preview.value.token
    await run(async () => { await mobileDocument('backupDiscard', { token }); preview.value = null })
    if (preview.value) return
  }
  dialog.value?.close()
}
</script>

<template>
  <div class="backup-entry">
    <div><strong>备份与恢复</strong><p>原图、虚拟副本、编辑历史、模板与自定义 Logo</p></div>
    <button @click="open">管理备份</button>
  </div>
  <dialog ref="dialog" class="backup-dialog" aria-labelledby="backup-title" @cancel.prevent="close">
    <h2 id="backup-title">备份与恢复</h2>
    <p>备份到你选择的文件夹。恢复会追加作品，不覆盖当前图库；重复恢复会生成新的副本。</p>
    <p>不包含已导出成片、未完成导出队列和应用偏好设置。备份含原图及拍摄信息，请妥善保管。</p>
    <template v-if="preview">
      <div class="backup-summary">校验通过：{{ preview.photos }} 张原图、{{ preview.copies }} 个虚拟副本、{{ preview.history }} 条历史、{{ preview.ui.templates.length }} 套模板。</div>
      <button :disabled="busy" class="primary" @click="confirmRestore">确认追加恢复</button>
    </template>
    <div v-else class="backup-actions">
      <button :disabled="busy" class="primary" @click="backup">创建完整备份</button>
      <button :disabled="busy" @click="restore">选择备份恢复</button>
    </div>
    <p v-if="status" role="status" aria-live="polite">{{ status }}</p>
    <p v-if="error" class="backup-error" role="alert">{{ error }}</p>
    <button v-if="error" :disabled="busy" @click="retry">重试未完成的恢复</button>
    <footer><button :disabled="busy" @click="close">{{ busy ? '正在处理…' : preview ? '取消恢复' : '关闭' }}</button></footer>
  </dialog>
</template>

<style scoped>
.backup-entry { display:flex; align-items:center; flex-wrap:wrap; gap:16px; padding:16px 0; }
.backup-entry div { flex:1; min-width:180px; }
.backup-entry p, .backup-dialog p { color:var(--text-dim); line-height:1.6; margin:8px 0; font-size:14px; overflow-wrap:anywhere; }
button { min-height:48px; padding:12px 16px; border:1px solid var(--border); border-radius:12px; background:var(--hover); color:var(--text); font-size:16px; }
button:active { opacity:.75; } button:disabled { opacity:.5; } button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.backup-dialog { margin:auto; width:min(520px, calc(100vw - 32px)); max-height:85dvh; overflow:auto; padding:24px; background:var(--panel); color:var(--text); border:1px solid var(--border); border-radius:20px; }
.backup-dialog::backdrop { background:#000b; }
.backup-dialog h2 { font-size:20px; }
.backup-actions { display:grid; gap:12px; margin-block:24px; }
.primary { background:var(--accent); color:#fff; }
.backup-summary { padding:16px 0; line-height:1.6; }
.backup-error { color:#ffb4b4 !important; }
footer { display:flex; justify-content:flex-end; margin-top:16px; }
</style>
