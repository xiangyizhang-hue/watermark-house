<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFrameConfig } from '../../composables/useFrameConfig'
import { watermarkFonts } from '../../core/watermarkFonts'
import { createWatermark, switchWatermarkStyle, watermarkStyles, normalizeWatermark, updateWatermark, watermarkAlignment, type WatermarkElement } from '../../core/creativeWatermark'
const { state, patch } = useFrameConfig()
const selected = ref(0)
const quickDialog = ref<HTMLDialogElement>()
const feedback = ref('')
const config = computed(() => state.creativeWatermark)
const active = computed(() => config.value?.elements[selected.value])
const editableElements = computed(() => config.value?.elements.map((e,i) => ({ e,i })).filter(({e}) => !(config.value?.linkBrands && e.id === '底部品牌')) ?? [])
const textElements = computed(() => editableElements.value.filter(({e}) => e.kind === 'text'))
function preset(style: number) {
  patch({ creativeWatermark: switchWatermarkStyle(config.value, style) }); selected.value = 0
}
function update(values: Partial<WatermarkElement>, index = selected.value) {
  if (!config.value) return
  patch({ creativeWatermark: updateWatermark(config.value, index, values) })
}
function linkBrands(linked: boolean) {
  if (!config.value) return
  const next = { ...config.value, linkBrands: linked }
  const top = next.elements.findIndex(e => e.id === '顶部品牌')
  patch({ creativeWatermark: linked ? updateWatermark(next, top, {}) : next })
  if (linked && active.value?.id === '底部品牌') selected.value = top
}
function add(kind: 'text' | 'line') {
  const base = config.value ?? createWatermark()
  const e = createWatermark().elements[kind === 'text' ? 0 : 1]!
  patch({ creativeWatermark: { ...base, elements: [...base.elements, { ...e, id: `自定义${base.elements.length+1}`, y: 50 }] } }); selected.value = base.elements.length
}
function remove() {
  if (!config.value) return
  const brand = config.value.linkBrands && ['顶部品牌','底部品牌'].includes(active.value?.id ?? '')
  patch({ creativeWatermark: { ...config.value, elements: config.value.elements.filter((e,i) => i !== selected.value && !(brand && ['顶部品牌','底部品牌'].includes(e.id))) } }); selected.value = 0
}
function photoOnly() {
  patch({ padding: 0, borderRatio: 0, borderRadius: 0, photoRadius: 0, shadow: 0, frameRatio: null, bgExpand: 0, bgBottomRatio: 0, scale: 100, showLogo: false, showCameraModel: false, showExif: false, showLens: false, showDate: false, infoLayout: 'classic', infoLayer: { ...state.infoLayer, enabled: false }, showWatermark: false })
}
function save() { try { if (config.value) { localStorage.setItem('framelab-creative-watermark', JSON.stringify(config.value)); feedback.value = '水印已保存，可用于其他图片' } } catch { feedback.value = '保存失败，请检查存储空间' } }
function restore() { try { const v = normalizeWatermark(JSON.parse(localStorage.getItem('framelab-creative-watermark') || 'null')); if (v) { patch({ creativeWatermark: v }); selected.value = 0; feedback.value = '已载入我的水印' } else feedback.value = '没有可载入的水印，请先保存' } catch { feedback.value = '水印数据无法读取，请重新保存' } }
</script>
<template>
  <details class="creative-panel" open>
    <summary>创意水印</summary>
    <p>直接覆盖照片。位置按图片百分比适配，字号按短边缩放，长文字自动缩小。</p>
    <div class="actions"><button v-for="(name,i) in watermarkStyles" :key="name" @click="preset(i)">{{ name }}</button></div>
    <button @click="photoOnly">恢复原图比例 · 清除旧边框和信息层</button>
    <p role="status">{{ feedback }}</p>
    <template v-if="config">
      <button @click="quickDialog?.showModal()">文字快捷编辑</button>
      <label v-if="config.elements.some(e => e.id === '顶部品牌') && config.elements.some(e => e.id === '底部品牌')"><input type="checkbox" :checked="config.linkBrands" @change="linkBrands(($event.target as HTMLInputElement).checked)">上下品牌联动（文字、格式和位置镜像）</label>
      <dialog ref="quickDialog" aria-label="文字快捷编辑">
        <h3>文字快捷编辑</h3>
        <p>修改即时生效；上下品牌联动时只需填写一次。</p>
        <label v-for="{e,i} in textElements" :key="i">{{ config.linkBrands && e.id === '顶部品牌' ? '上下品牌' : e.id }}<textarea :value="e.text" @input="update({ text: ($event.target as HTMLTextAreaElement).value }, i)" /></label>
        <button @click="quickDialog?.close()">完成</button>
      </dialog>
      <label><input type="checkbox" :checked="config.enabled" @change="patch({ creativeWatermark: { ...config, enabled: !config.enabled } })">显示创意水印</label>
      <div class="actions"><button @click="save">保存我的水印</button><button @click="restore">载入我的水印</button><button @click="add('text')">加文字</button><button @click="add('line')">加横线</button></div>
      <label>编辑元素<select v-model="selected"><option v-for="{e,i} in editableElements" :key="i" :value="i">{{ config.linkBrands && e.id === '顶部品牌' ? '上下品牌（联动）' : e.id }}</option></select></label>
      <template v-if="active">
        <label><input type="checkbox" :checked="active.enabled" @change="update({ enabled: !active.enabled })">显示此元素</label>
        <label v-if="active.kind === 'text'">文字（支持换行）<textarea :value="active.text" @input="update({ text: ($event.target as HTMLTextAreaElement).value })" /></label>
        <div class="fields">
          <label v-for="field in ([['x','水平位置 %',0,100,.1],['y','垂直位置 %',0,100,.1],['width','最大宽度 %',1,100,1],['size',active.kind === 'line' ? '线粗' : '字号',.1,150,.1],['opacity','透明度',0,1,.05],['rotation','旋转角度',-180,180,1]] as const)" :key="field[0]">{{ field[1] }}<input type="number" :min="field[2]" :max="field[3]" :step="field[4]" :value="active[field[0]]" @input="update({ [field[0]]: Math.min(field[3],Math.max(field[2],Number(($event.target as HTMLInputElement).value))) })"></label>
        </div>
        <label>颜色<input type="color" :value="active.color" @input="update({ color: ($event.target as HTMLInputElement).value })"></label>
        <label>对齐（保留边距）<select :value="active.align" @change="update(watermarkAlignment(($event.target as HTMLSelectElement).value as WatermarkElement['align'], active.edgeMargin ?? 5))"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
        <div class="actions"><button v-for="[a,label] in ([['left','左对齐'],['center','居中'],['right','右对齐']] as const)" :key="a" :aria-pressed="active.align === a" @click="update(watermarkAlignment(a, active?.edgeMargin ?? 5))">{{ label }}</button></div>
        <label>对齐留白 %<input type="number" min="0" max="45" step=".1" :value="active.edgeMargin ?? 5" @input="update(watermarkAlignment(active.align, Number(($event.target as HTMLInputElement).value)))"></label>
        <p>默认留白 5%；按钮可重复点击。需要贴边时设为 0%，仍可单独微调水平位置。</p>
        <template v-if="active.kind === 'text'">
          <label>字体（可输入已安装字体名）<input :value="active.font" @change="update({ font: ($event.target as HTMLInputElement).value })"></label>
          <label>内置精选字体<select :value="active.font" @change="update({ font: ($event.target as HTMLSelectElement).value })"><option v-if="!watermarkFonts.some(f => f.value === active?.font)" :value="active.font">当前自定义字体</option><option v-for="font in watermarkFonts" :key="font.value" :value="font.value">{{ font.label }}</option></select></label>
          <label>字距<input type="number" min="0" max="30" step=".1" :value="active.spacing" @input="update({ spacing: Math.max(0,Number(($event.target as HTMLInputElement).value)) })"></label>
          <label>字重<select :value="active.weight" @change="update({ weight: Number(($event.target as HTMLSelectElement).value) })"><option :value="300">细</option><option :value="400">常规</option><option :value="600">加粗</option><option :value="800">特粗</option></select></label>
        </template>
        <button @click="remove">删除此元素</button>
      </template>
    </template>
    <button v-else @click="restore">载入我的水印</button>
  </details>
</template>
<style scoped>
.creative-panel { padding: 14px; border-bottom: 1px solid #5555; }
dialog { position: fixed; inset: 0; margin: auto; width: min(440px, calc(100vw - 48px)); max-height: 80vh; overflow: auto; background: var(--panel-bg, #252525); color: var(--text, #eee); border: 1px solid #8886; border-radius: 12px; padding: 20px; }
dialog::backdrop { background: #0008; }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid var(--accent, #80bfff); outline-offset: 2px; }
summary { cursor: pointer; font-weight: 600; padding: 8px 0; }
p { opacity: .7; font-size: 12px; line-height: 1.6; }
label { display: block; margin: 10px 0; font-size: 12px; }
input:not([type=checkbox]), select, textarea { display: block; width: 100%; box-sizing: border-box; background: #8881; color: inherit; border: 1px solid #8886; border-radius: 5px; padding: 7px; margin-top: 5px; }
option { color: #111; }
textarea { min-height: 70px; resize: vertical; }
button { background: #8882; color: inherit; border: 1px solid #8886; padding: 8px; border-radius: 5px; cursor: pointer; }
button:hover { background: #8884; }
.actions, .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
</style>
