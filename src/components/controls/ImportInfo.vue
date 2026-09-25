<script setup lang="ts">
import { ref } from 'vue'
import { useFrameConfig } from '../../composables/useFrameConfig'
import { useLibrary } from '../../composables/useLibrary'
import { parseExif, buildExifText, formatDate } from '../../composables/useExif'
import { isDesktopTauri } from '../../platform/env'
const { state, patch } = useFrameConfig()
const library = useLibrary()
const input = ref<HTMLInputElement>()
const busy = ref(false)
const message = ref('')
async function read(source: File | ArrayBuffer, name: string, photoId: string | null) {
  busy.value = true
  message.value = ''
  try {
    const result = await parseExif(source)
    if (library.activeId.value !== photoId) throw new Error('当前照片已切换，未导入信息，请在目标照片上重试')
    patch({ exifRaw: result.raw, exifText: buildExifText(result.raw, { eqFocal: state.eqFocal, cropFactor: state.cropFactor }), cameraModel: result.model ?? '', brand: result.brandId ?? '自定义', lensText: result.lens ?? '', dateText: formatDate(result.raw.dateTimeOriginal, state.dateFormat) })
    message.value = `已从 ${name} 导入信息；照片与排版不变。需要显示时勾选下方相应开关。`
  } catch(e) { message.value = `导入失败：${String(e)}。请尝试相机直出的 JPG 或 TIFF；不支持的 RAW 不会修改现有信息。` }
  finally { busy.value = false }
}
async function pick() {
  if (!isDesktopTauri) { input.value?.click(); return }
  const id = library.activeId.value
  busy.value = true
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const path = await invoke<string | null>('pick_metadata_file')
    if (!path) return
    const { readLocalBytes } = await import('../../platform/fs')
    await read(await readLocalBytes(path), path.split(/[\\/]/).pop()!, id)
  } catch(e) { message.value = `无法读取文件：${String(e)}` } finally { busy.value = false }
}
async function selected(e: Event) {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  try { if (file) await read(file, file.name, library.activeId.value) }
  finally { el.value = '' }
}
</script>
<template><div class="import-info"><button :disabled="busy || !state.photoSrc" @click="pick">{{ busy ? '读取信息中…' : '从原片导入 INFO 信息' }}</button><input ref="input" type="file" accept=".jpg,.jpeg,.tif,.tiff,.nef,.nrw,.arw,.dng,.cr2,.raw,.orf,.rw2" hidden @change="selected"><p>选择 JPG、TIFF 或含 TIFF/EXIF 的 RAW（如 NEF）。仅读取拍摄信息，不替换当前图片。</p><p role="status">{{ message }}</p></div></template>
<style scoped>.import-info { margin: 12px 0; } button { padding: 9px; width: 100%; background: var(--hover); color: var(--text); border: 1px solid var(--border); cursor:pointer; } p { font-size:12px; line-height:1.6; margin-top:6px; }</style>
