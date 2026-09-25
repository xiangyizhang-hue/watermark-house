<script setup lang="ts">
import { ref } from 'vue'
import { useFrameConfig } from '../../composables/useFrameConfig'
const { state, patch } = useFrameConfig()
const picker = ref<HTMLInputElement>()
const busy = ref(false)
const error = ref('')
async function importImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  busy.value = true
  error.value = ''
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPG 或 WebP 图片')
    if (file.size > 20 * 1024 * 1024) throw new Error('水印素材请控制在 20 MB 以内')
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('读取失败，请重新选择图片'))
      reader.readAsDataURL(file)
    })
    const image = new Image()
    image.src = data
    await image.decode()
    if (image.naturalWidth * image.naturalHeight > 16000000) throw new Error('水印素材超过 1600 万像素，请缩小素材后导入')
    patch({ watermarkImage: data, showWatermark: true, watermarkTint: null,
      watermarkTile: false, watermarkAngle: 0, watermarkOpacity: 1,
      watermarkPosition: { x: 50, y: 90 } })
  } catch (e) { error.value = e instanceof Error ? e.message : '导入失败' }
  finally { input.value = ''; busy.value = false }
}
function position(axis: 'x' | 'y', value: number) {
  patch({ watermarkPosition: { ...(state.watermarkPosition ?? { x: 50, y: 90 }), [axis]: value } })
}
</script>

<template>
  <div class="image-watermark-panel">
    <input ref="picker" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="importImage" />
    <div class="image-watermark-source">
      <img v-if="state.watermarkImage" :src="state.watermarkImage" alt="当前图片水印素材" />
      <div><h3>{{ state.watermarkImage ? '自定义图片水印' : '让作品拥有你的签名' }}</h3><p>透明 PNG 可保留镂空；改色不会修改原素材。</p></div>
    </div>
    <button class="image-watermark-import" :disabled="busy" @click="picker?.click()">{{ busy ? '正在读取…' : state.watermarkImage ? '更换素材' : '导入图片水印' }}</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="state.watermarkImage">
      <label class="image-watermark-toggle"><span>显示图片水印</span><input v-model="state.showWatermark" type="checkbox" /></label>
      <label>不透明度 <output>{{ Math.round(state.watermarkOpacity * 100) }}%</output><input v-model.number="state.watermarkOpacity" type="range" min="0" max="1" step="0.01" /></label>
      <label>大小 <output>{{ state.watermarkSize }}%</output><input v-model.number="state.watermarkSize" type="range" min="1" max="100" step="1" /></label>
      <label>旋转 <output>{{ state.watermarkAngle }}°</output><input v-model.number="state.watermarkAngle" type="range" min="-180" max="180" /></label>
      <div class="image-watermark-color"><button :aria-pressed="!state.watermarkTint" @click="patch({ watermarkTint: null })">保留原色</button><label>单色染色<input type="color" :value="state.watermarkTint || '#ffffff'" @input="patch({ watermarkTint: ($event.target as HTMLInputElement).value })" /></label></div>
      <label class="image-watermark-toggle"><span>平铺水印</span><input v-model="state.watermarkTile" type="checkbox" /></label>
      <template v-if="!state.watermarkTile">
        <label>水平位置<input type="range" min="0" max="100" :value="state.watermarkPosition?.x ?? 50" @input="position('x', Number(($event.target as HTMLInputElement).value))" /></label>
        <label>垂直位置<input type="range" min="0" max="100" :value="state.watermarkPosition?.y ?? 90" @input="position('y', Number(($event.target as HTMLInputElement).value))" /></label>
        <div class="image-watermark-align" aria-label="水印边缘对齐"><button @click="position('x', 0)">靠左</button><button @click="position('x', 50)">居中</button><button @click="position('x', 100)">靠右</button><button @click="position('y', 0)">顶部</button><button @click="position('y', 50)">中部</button><button @click="position('y', 100)">底部</button></div>
      </template>
      <button @click="patch({ watermarkImage: null, showWatermark: false })">移除图片水印</button>
    </template>
  </div>
</template>

<style scoped>
.image-watermark-panel { overflow:auto; padding:0 16px 24px; display:grid; gap:16px; min-height:0; }
.image-watermark-source { display:flex; gap:16px; align-items:center; }
.image-watermark-source img { width:72px; height:72px; object-fit:contain; border-radius:12px; background:repeating-conic-gradient(#383838 0% 25%, #555 0% 50%) 0 / 16px 16px; }
h3 { font-size:16px; margin:0 0 8px; } p { font-size:14px; line-height:1.5; color:var(--text-dim); }
label { display:block; min-width:0; font-size:16px; } output { float:right; font-variant-numeric:tabular-nums; }
input[type=range] { display:block; width:100%; min-height:48px; accent-color:var(--accent); }
button { min-height:48px; border:1px solid var(--border); border-radius:12px; background:var(--panel-2); color:var(--text); padding:8px 12px; font-size:16px; }
.image-watermark-import { background:var(--accent); color:#171717; font-weight:600; }
.image-watermark-toggle,.image-watermark-color { display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:48px; }
.image-watermark-color label { display:flex; gap:8px; align-items:center; }
input[type=color] { width:48px; height:48px; } input[type=checkbox] { width:24px; height:24px; accent-color:var(--accent); }
.image-watermark-align { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
button:active { opacity:.75; } [role=alert] { color:#ffb4ab; }
</style>
