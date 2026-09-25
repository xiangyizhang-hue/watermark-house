<script setup lang="ts">
import { ref, onBeforeUnmount, nextTick } from 'vue'
import { useLibrary } from '../../composables/useLibrary'
import { useParamClipboard } from '../../composables/useParamClipboard'
const library = useLibrary()
const target = ref(''), position = ref<{x:number;y:number} | null>(null), busy = ref(false)
const button = ref<HTMLButtonElement>()
let listeners: AbortController | null = null
function close() { position.value = null; listeners?.abort(); listeners = null }
async function open(event: MouseEvent, id: string) {
  event.preventDefault(); event.stopPropagation(); close()
  target.value = id
  position.value = { x: Math.max(8,Math.min(event.clientX,window.innerWidth-230)), y: Math.max(8,Math.min(event.clientY,window.innerHeight-80)) }
  await nextTick(); button.value?.focus()
  listeners = new AbortController()
  window.addEventListener('pointerdown', e => { if (!(e.target as HTMLElement)?.closest('.photo-copy-menu')) close() }, {signal:listeners.signal})
  window.addEventListener('keydown', e => { if(e.key==='Escape' || e.key==='Tab') close() }, {signal:listeners.signal})
}
async function copy() {
  if (busy.value) return
  busy.value = true
  try { await library.createCopy(target.value); close(); useParamClipboard().showResult('副本已创建，与原图共享文件，编辑独立保存。') }
  catch(e) { useParamClipboard().showResult(`创建副本失败：${String(e)}`) }
  finally { busy.value = false }
}
defineExpose({open})
onBeforeUnmount(close)
</script>
<template><Teleport to="body"><div v-if="position" class="photo-copy-menu" role="menu" :style="{left:position.x+'px',top:position.y+'px'}"><button ref="button" role="menuitem" :disabled="busy" @click="copy">{{busy ? '正在创建…' : '创建图片副本'}}</button><small>共享原文件，独立保存编辑</small></div></Teleport></template>
<style scoped>.photo-copy-menu { position:fixed; z-index:1100; background:var(--panel); border:1px solid var(--border); padding:8px; min-width:210px; box-shadow:0 8px 25px #0006; } button { width:100%; text-align:left; padding:8px; cursor:pointer; background:var(--panel-2); color:var(--text); border:0; } small { display:block; padding:6px; color:var(--text-dim); }</style>
