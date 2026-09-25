<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFrameConfig } from '../../composables/useFrameConfig'
import { useLibrary } from '../../composables/useLibrary'
import { detectPalette, paletteFor, paletteError, paletteVersion } from '../../core/photoPalette'
const { state, patch } = useFrameConfig()
const library = useLibrary()
const busy = ref(false), message = ref('')
const colors = computed(() => { void paletteVersion.value; return state.paletteColors?.length ? state.paletteColors : paletteFor(state.photoSrc, state.paletteCount) })
const error = computed(() => { void paletteVersion.value; return paletteError(state.photoSrc, state.paletteCount) })
async function extract() {
  const src = state.photoSrc, id = library.activeId.value, count = state.paletteCount
  if (!src || busy.value) return
  busy.value = true; message.value = ''
  try {
    await detectPalette(src, count, true)
    if (library.activeId.value === id && state.paletteCount === count) { patch({ paletteColors: [] }); message.value = '已从当前原图重新提取。' }
  } catch (e) { message.value = `取色失败：${String(e)}` }
  finally { busy.value = false }
}
function edit(index: number, event: Event) { const next = [...colors.value]; next[index] = (event.target as HTMLInputElement).value; patch({ paletteColors: next }) }
function countChanged(event: Event) { patch({ paletteCount: Number((event.target as HTMLSelectElement).value), paletteColors: [] }) }
</script>
<template>
  <section class="photo-palette" aria-label="照片真实取色">
    <h4>照片真实取色</h4>
    <label>颜色数量 <select :value="state.paletteCount" @change="countChanged"><option v-for="n in [2,3,4,5,6,7,8]" :key="n" :value="n">{{ n }} 色</option></select></label>
    <button :disabled="busy || !state.photoSrc" @click="extract">{{ busy ? '提取中…' : '重新提取当前照片' }}</button>
    <div class="swatches"><label v-for="(color, i) in colors" :key="i"><input type="color" :aria-label="`色卡颜色 ${i+1}`" :value="color" @input="edit(i,$event)"><span>{{ color }}</span></label></div>
    <p>分析原图主色（不含边框和水印），点击色块可调整。自动色卡随照片变化；手动颜色随模板保存。</p>
    <p role="status">{{ message || error || (colors.length ? '' : '正在读取照片颜色…') }}</p>
  </section>
</template>
<style scoped>
.photo-palette { padding: 10px 0; border-top: 1px solid var(--border); } h4 { margin: 0 0 8px; } button, select { padding: 6px; color: var(--text); background: var(--panel-2); border: 1px solid var(--border); } button { margin: 8px 0; cursor: pointer; } .swatches { display: flex; flex-wrap: wrap; gap: 6px; } .swatches label { display: grid; font-size: 10px; gap: 3px; } input { width: 48px; height: 32px; padding: 0; cursor: pointer; } p { font-size: 12px; line-height: 1.5; }
</style>
