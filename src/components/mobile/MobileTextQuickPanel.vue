<script setup lang="ts">
// 手机端文字快捷编辑：把创意水印中的所有文字元素集中到一个可滚动面板，
// 文字输入与画布状态使用同一个 FrameConfig，避免再切换到「编辑元素」下拉框。
import { computed } from 'vue'
import { useFrameConfig } from '../../composables/useFrameConfig'
import { createWatermark, updateWatermark } from '../../core/creativeWatermark'
import Icon from '../common/Icon.vue'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const { state, patch } = useFrameConfig()

const config = computed(() => state.creativeWatermark)
const textItems = computed(() =>
  config.value?.elements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => element.kind === 'text' && !(config.value?.linkBrands && element.id === '底部品牌')) ?? [],
)

function close() {
  emit('update:modelValue', false)
}

function create() {
  patch({ creativeWatermark: createWatermark() })
}

function updateText(index: number, value: string) {
  const current = config.value
  if (!current) return
  patch({ creativeWatermark: updateWatermark(current, index, { text: value }) })
}

function toggleLink(value: boolean) {
  const current = config.value
  if (!current) return
  const next = { ...current, linkBrands: value }
  const top = next.elements.findIndex((item) => item.id === '顶部品牌')
  patch({ creativeWatermark: value && top >= 0 ? updateWatermark(next, top, {}) : next })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="mobile-quick-mask" @click.self="close">
      <section class="mobile-quick-sheet" role="dialog" aria-modal="true" aria-label="文字快捷编辑">
        <header class="mobile-quick-head">
          <div>
            <h2>文字快捷编辑</h2>
            <p>修改立即同步到预览；上下品牌联动时只需填写一次。</p>
          </div>
          <button class="mobile-quick-close" aria-label="关闭" @click="close"><Icon name="close" /></button>
        </header>

        <div v-if="!config" class="mobile-quick-empty">
          <p>当前还没有创意水印文字。</p>
          <button class="mobile-action primary" @click="create">创建创意水印</button>
        </div>
        <template v-else>
          <label v-if="config.elements.some((item) => item.id === '顶部品牌') && config.elements.some((item) => item.id === '底部品牌')" class="mobile-link-row">
            <input type="checkbox" :checked="config.linkBrands" @change="toggleLink(($event.target as HTMLInputElement).checked)" />
            <span>上下品牌联动</span>
            <small>文字、格式和位置镜像</small>
          </label>
          <div class="mobile-quick-list">
            <label v-for="{ element, index } in textItems" :key="element.id + index" class="mobile-text-field">
              <span>{{ config.linkBrands && element.id === '顶部品牌' ? '上下品牌' : element.id }}</span>
              <textarea :value="element.text" rows="2" @input="updateText(index, ($event.target as HTMLTextAreaElement).value)" />
            </label>
          </div>
        </template>

        <footer class="mobile-quick-foot">
          <button class="mobile-action" @click="close">完成</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.mobile-quick-mask {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: flex-end;
  background: rgba(2, 6, 23, .68);
}
.mobile-quick-sheet {
  width: 100%;
  max-height: min(86dvh, 760px);
  overflow: auto;
  padding: 20px max(16px, env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: #151d2d;
  border: 1px solid #2e3b54;
  border-bottom: none;
  border-radius: 22px 22px 0 0;
  box-shadow: 0 -20px 70px rgba(0, 0, 0, .45);
}
.mobile-quick-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.mobile-quick-head h2 { color: #f4f7fb; font-size: 18px; line-height: 24px; }
.mobile-quick-head p { margin-top: 4px; color: #98a8c0; font-size: 13px; line-height: 20px; }
.mobile-quick-close {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  border: 0;
  border-radius: 14px;
  color: #bdc9da;
  background: #202d44;
  font-size: 28px;
  line-height: 1;
}
.mobile-quick-close :deep(svg) { width: 20px; height: 20px; }
.mobile-link-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 0 14px;
  color: #eef3fb;
  background: #1b2940;
  border: 1px solid #2d3c57;
  border-radius: 14px;
  font-size: 15px;
}
.mobile-link-row { flex-wrap:wrap; padding-block:12px; }
.mobile-link-row small { flex-basis:100%; color: #adbad0; font-size: 13px; padding-left:30px; }
.mobile-link-row input { width: 20px; height: 20px; accent-color: #8b5cf6; }
.mobile-quick-list { display: grid; gap: 14px; margin-top: 16px; }
.mobile-text-field { display: grid; gap: 7px; color: #dfe7f4; font-size: 14px; }
.mobile-text-field span { font-weight: 600; }
.mobile-text-field textarea {
  width: 100%;
  min-height: 64px;
  resize: vertical;
  padding: 12px;
  color: #f4f7fb;
  background: #0f1728;
  border: 1px solid #34425e;
  border-radius: 12px;
  outline: none;
  font: inherit;
  line-height: 22px;
}
.mobile-text-field textarea:focus { border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139, 92, 246, .18); }
.mobile-quick-empty { padding: 24px 0; color: #aab8cb; font-size: 14px; }
.mobile-quick-foot { display: flex; justify-content: flex-end; margin-top: 18px; position:sticky; bottom:0; padding-block:8px; background:#151d2d; }
.mobile-action { min-height: 48px; padding: 0 18px; border: 1px solid #34425e; border-radius: 12px; background: #202d44; color: #e8eef8; font-size: 15px; }
.mobile-action.primary { background: #7c3aed; border-color: #8b5cf6; color: #fff; }
@media (min-width: 721px) {
  .mobile-quick-mask { align-items: center; justify-content: center; }
  .mobile-quick-sheet { width: min(560px, calc(100vw - 32px)); max-height: 80vh; border-bottom: 1px solid #2e3b54; border-radius: 20px; }
}
</style>
