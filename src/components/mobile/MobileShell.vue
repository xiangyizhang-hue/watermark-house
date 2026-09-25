<script setup lang="ts">
// 水印小屋 Android 个人版外壳。
// 复用桌面端的 Workspace、LibraryView、ControlPanel、ExportPanel 和模板逻辑，
// 只替换导航与参数承载方式：画布优先，复杂参数放到底部 sheet，避免把桌面右栏
// 缩小后硬塞进手机屏幕。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Workspace from '../layout/Workspace.vue'
import LibraryView from '../layout/LibraryView.vue'
import ExportPanel from '../layout/ExportPanel.vue'
import RightPanels from '../layout/ControlPanel.vue'
import TemplatePickerModal from '../controls/TemplatePickerModal.vue'
import PreferencesModal from '../layout/PreferencesModal.vue'
import MobileTextQuickPanel from './MobileTextQuickPanel.vue'
import MobileHistoryPanel from './MobileHistoryPanel.vue'
import MobileImageWatermarkPanel from './MobileImageWatermarkPanel.vue'
import MediaInfoPanel from '../layout/MediaInfoPanel.vue'
import { useAppState } from '../../composables/useAppState'
import { useLibrary } from '../../composables/useLibrary'
import { useFrameConfig } from '../../composables/useFrameConfig'
import { useHistory } from '../../composables/useHistory'
import { mobilePersistenceState, type MobilePersistenceState } from '../../platform/mobileLifecycle'
import Icon from '../common/Icon.vue'
import { consumeMobileBack } from '../../platform/mobileBack'

type MobileSection = 'creative' | 'photo' | 'background' | 'border' | 'info' | 'media' | 'history' | 'image'

defineProps<{
  photoSrc: string | null
  bgImage: ImageBitmap | HTMLImageElement | HTMLCanvasElement | null
}>()

const app = useAppState()
const library = useLibrary()
const editHistory = useHistory()
const { resetUndecorated } = useFrameConfig()

const sheetOpen = ref(false)
const sheetSection = ref<MobileSection>('creative')
const quickTextOpen = ref(false)
const templateOpen = ref(false)
const preferencesOpen = ref(false)
const moreOpen = ref(false)
const saveState = mobilePersistenceState

const activeItem = computed(() => library.items.find((item) => item.id === library.activeId.value) ?? null)
const activeName = computed(() => activeItem.value?.name ?? '未选择照片')
const sheetTitle = computed(() => {
  const labels: Record<MobileSection, string> = {
    creative: '创意水印',
    image: '图片水印',
    photo: '画面 · 照片',
    background: '画面 · 背景',
    border: '画面 · 边框',
    info: '信息与色卡',
    media: '照片信息',
    history: '编辑记录',
  }
  return labels[sheetSection.value]
})
const canvasSection = computed(() => ['photo', 'background', 'border'].includes(sheetSection.value))
const panelSection = computed((): Exclude<MobileSection, 'media' | 'history' | 'image'> =>
  sheetSection.value === 'media' || sheetSection.value === 'history' || sheetSection.value === 'image' ? 'creative' : sheetSection.value,
)
const saveStatusLabel = computed(() => {
  const labels: Record<MobilePersistenceState, string> = {
    ready: '本地保存',
    pending: '待保存',
    saving: '保存中…',
    saved: '已保存',
    error: '保存失败',
  }
  return labels[saveState.value]
})

function openSection(section: MobileSection) {
  sheetSection.value = section
  sheetOpen.value = true
  moreOpen.value = false
}

function closeSheet() {
  sheetOpen.value = false
}

function openTemplates() {
  templateOpen.value = true
  moreOpen.value = false
}

function openSettings() {
  preferencesOpen.value = true
  moreOpen.value = false
}

function goLibrary() {
  sheetOpen.value = false
  app.setModule('library')
}

function goExport() {
  sheetOpen.value = false
  app.setModule('export')
}

/** 手机端复位语义：保留当前原图和拍摄信息，但明确关闭所有装饰层。 */
function resetPlain() {
  resetUndecorated()
  moreOpen.value = false
  sheetOpen.value = false
}

function onBack(): boolean {
  if (consumeMobileBack()) return true
  if (quickTextOpen.value) {
    quickTextOpen.value = false
    return true
  }
  if (templateOpen.value) {
    templateOpen.value = false
    return true
  }
  if (preferencesOpen.value) {
    preferencesOpen.value = false
    return true
  }
  if (moreOpen.value) {
    moreOpen.value = false
    return true
  }
  if (sheetOpen.value) {
    sheetOpen.value = false
    return true
  }
  if (app.activeModule.value !== 'library') {
    app.setModule(app.activeModule.value === 'export' && activeItem.value ? 'develop' : 'library')
    return true
  }
  return false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (quickTextOpen.value || templateOpen.value || preferencesOpen.value || moreOpen.value || sheetOpen.value) {
      event.preventDefault()
      onBack()
    }
  }
}

// 记录一次当前页面状态，避免 Android WebView 的页面历史把硬件返回键变成空白页。
function onPopState(event: PopStateEvent) {
  event.preventDefault()
  onBack()
  window.history.pushState({ framelabMobile: true }, '')
}

onMounted(() => {
  ;(window as unknown as { __FRAMELAB_HANDLE_BACK__?: () => boolean }).__FRAMELAB_HANDLE_BACK__ = onBack
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('popstate', onPopState)
  if (window.history.state?.framelabMobile !== true) window.history.replaceState({ framelabMobile: true }, '')
})
onBeforeUnmount(() => {
  delete (window as unknown as { __FRAMELAB_HANDLE_BACK__?: () => boolean }).__FRAMELAB_HANDLE_BACK__
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('popstate', onPopState)
})
</script>

<template>
  <div class="mobile-shell" :class="{ 'is-editing': app.activeModule.value === 'develop', 'has-panel': sheetOpen }">
    <header class="mobile-topbar">
      <button v-if="app.activeModule.value !== 'library'" class="mobile-icon-button mobile-back" :aria-label="app.activeModule.value === 'export' ? '返回编辑' : '返回图库'" @click="onBack"><Icon name="back" /></button>
      <div class="mobile-brand">
        <span class="mobile-brand-mark" aria-hidden="true" />
        <span>水印小屋</span>
        <small>个人版</small>
      </div>
      <div class="mobile-top-actions">
        <template v-if="app.activeModule.value === 'develop'">
          <button class="mobile-icon-button" :disabled="!editHistory.canUndo()" aria-label="撤销" @click="editHistory.undo()"><Icon name="undo" /></button>
          <button class="mobile-icon-button" :disabled="!editHistory.canRedo()" aria-label="重做" @click="editHistory.redo()"><Icon name="redo" /></button>
          <button class="mobile-icon-button" aria-label="更多操作" @click="moreOpen = !moreOpen"><Icon name="more" /></button>
          <button class="mobile-export-button" @click="goExport">导出</button>
        </template>
        <template v-else-if="app.activeModule.value === 'library'">
          <span class="mobile-photo-count">{{ library.items.length }} 张</span>
        </template>
        <template v-else>
          <button class="mobile-icon-button" aria-label="返回图库" @click="goLibrary">图库</button>
        </template>
      </div>

      <div v-if="moreOpen" class="mobile-more-menu" role="menu">
        <button role="menuitem" @click="quickTextOpen = true; moreOpen = false">文字快捷编辑</button>
        <button role="menuitem" @click="openTemplates">打开模板库</button>
        <button role="menuitem" @click="openSection('media')">照片信息</button>
        <button role="menuitem" @click="openSection('history')">编辑记录</button>
        <button role="menuitem" @click="resetPlain">复位为无装饰</button>
        <button role="menuitem" @click="openSettings">设置</button>
      </div>
    </header>

    <main class="mobile-main">
      <section v-if="app.activeModule.value === 'library'" class="mobile-library-page">
        <div class="mobile-page-heading">
          <div>
            <h1>图库</h1>
          </div>
        </div>
        <LibraryView />
      </section>

      <section v-else-if="app.activeModule.value === 'develop'" class="mobile-editor-page">
        <div class="mobile-editor-meta">
          <button class="mobile-current-name" aria-label="查看完整照片名称和信息" @click="openSection('media')">{{ activeName }}</button>
          <span v-if="activeItem" class="mobile-current-dim">{{ activeItem.width }} × {{ activeItem.height }}</span>
          <span class="mobile-save-status" :class="`is-${saveState}`" aria-live="polite"><span class="mobile-save-dot" aria-hidden="true" />{{ saveStatusLabel }}</span>
        </div>
        <Workspace :photo-src="photoSrc" :bg-image="bgImage" />
      </section>

      <section v-else class="mobile-export-page">
        <ExportPanel />
      </section>
    </main>

    <nav v-if="app.activeModule.value === 'develop'" class="mobile-editor-tools" aria-label="编辑工具">
      <button class="mobile-tool" :aria-pressed="sheetOpen && sheetSection === 'creative'" @click="openSection('creative')"><Icon class="mobile-tool-icon" name="watermark" /><span>水印</span></button>
      <button class="mobile-tool" :aria-pressed="sheetOpen && sheetSection === 'image'" @click="openSection('image')"><Icon class="mobile-tool-icon" name="photo" /><span>图片水印</span></button>
      <button class="mobile-tool" :aria-pressed="sheetOpen && canvasSection" @click="openSection('photo')"><Icon class="mobile-tool-icon" name="adjust" /><span>画面</span></button>
      <button class="mobile-tool" :aria-pressed="sheetOpen && sheetSection === 'info'" @click="openSection('info')"><Icon class="mobile-tool-icon" name="info" /><span>信息</span></button>
      <button class="mobile-tool" @click="openTemplates"><Icon class="mobile-tool-icon" name="template" /><span>模板</span></button>
    </nav>
    <nav v-else class="mobile-bottom-nav" aria-label="主导航">
      <button class="mobile-nav-item" :class="{ active: app.activeModule.value === 'library' }" @click="goLibrary"><Icon name="library" /><small>图库</small></button>
      <button class="mobile-nav-item" @click="openTemplates"><Icon name="template" /><small>模板</small></button>
      <button class="mobile-nav-item" @click="openSettings"><Icon name="settings" /><small>设置</small></button>
    </nav>

    <Transition name="mobile-sheet">
      <div v-if="sheetOpen" class="mobile-sheet-layer" @click.self="closeSheet">
        <section class="mobile-sheet" role="region" :aria-label="sheetTitle">
          <div class="mobile-sheet-handle" aria-hidden="true" />
          <header class="mobile-sheet-header">
            <div>
              <h2>{{ sheetTitle }}</h2>
            </div>
            <div class="mobile-sheet-actions">
              <button v-if="sheetSection === 'creative'" class="mobile-sheet-reset" @click="quickTextOpen = true">改文字</button>
              <button class="mobile-sheet-close" aria-label="关闭面板" @click="closeSheet"><Icon name="close" /></button>
            </div>
          </header>
          <div v-if="canvasSection" class="mobile-section-tabs" role="tablist">
            <button :class="{ active: sheetSection === 'photo' }" @click="sheetSection = 'photo'">照片</button>
            <button :class="{ active: sheetSection === 'background' }" @click="sheetSection = 'background'">背景</button>
            <button :class="{ active: sheetSection === 'border' }" @click="sheetSection = 'border'">边框</button>
          </div>
          <MediaInfoPanel v-if="sheetSection === 'media'" />
          <MobileHistoryPanel v-else-if="sheetSection === 'history'" />
          <MobileImageWatermarkPanel v-else-if="sheetSection === 'image'" />
          <RightPanels v-else :mobile-section="panelSection" />
        </section>
      </div>
    </Transition>

    <MobileTextQuickPanel v-model="quickTextOpen" />
    <TemplatePickerModal v-model="templateOpen" category="frame" title="模板库" :allow-save="app.activeModule.value === 'develop' && !!activeItem" />
    <PreferencesModal v-if="preferencesOpen" @close="preferencesOpen = false" />
  </div>
</template>

<style scoped>
.mobile-shell {
  min-height: 100dvh;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: #eef3fb;
  background: #0f1728;
  overflow: hidden;
  isolation: isolate;
}
.mobile-topbar {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: calc(60px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) max(14px, env(safe-area-inset-right)) 0 max(14px, env(safe-area-inset-left));
  background: rgba(15, 23, 40, .96);
  border-bottom: 1px solid #273650;
}
.mobile-brand { display: flex; align-items: baseline; gap: 5px; color: #f7f9fd; font-size: 16px; font-weight: 700; letter-spacing: .01em; white-space: nowrap; }
.mobile-brand small { color: #91a0b5; font-size: 11px; font-weight: 500; }
.mobile-brand-mark { width: 14px; height: 14px; display: inline-block; border: 2px solid #a78bfa; border-radius: 50%; box-shadow: inset 0 0 0 3px #0f1728; }
.mobile-top-actions { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.is-editing .mobile-brand { display: none; }
.mobile-top-actions { flex-shrink: 0; }
.mobile-icon-button,
.mobile-export-button,
.mobile-back { min-width: 48px; min-height: 48px; border: 0; border-radius: 12px; color: #cbd6e6; background: transparent; font-size: 18px; }
.mobile-icon-button:active, .mobile-back:active { background: #202d44; }
.mobile-icon-button:disabled { opacity: .35; }
.mobile-back { margin-left: -8px; font-size: 34px; line-height: 1; }
.mobile-icon-button :deep(svg), .mobile-back :deep(svg) { width: 22px; height: 22px; }
.mobile-export-button { padding: 0 14px; color: #fff; background: #7c3aed; font-size: 14px; font-weight: 700; }
.mobile-photo-count { color: #91a0b5; font-size: 13px; }
.mobile-more-menu { position: absolute; top: calc(100% - 2px); right: 12px; z-index: 25; width: min(220px, calc(100vw - 24px)); padding: 8px; background: #18243a; border: 1px solid #34425e; border-radius: 14px; box-shadow: 0 18px 46px rgba(0, 0, 0, .45); }
.mobile-more-menu button { display: block; width: 100%; min-height: 48px; padding: 0 14px; border: 0; border-radius: 10px; color: #e7edf7; background: transparent; text-align: left; font-size: 15px; }
.mobile-more-menu button:active { background: #263650; }
.mobile-main { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.mobile-library-page, .mobile-export-page, .mobile-editor-page { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.mobile-page-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex: none; padding: 18px 16px 10px; }
.mobile-page-heading h1 { margin-top: 2px; color: #f6f8fc; font-size: 26px; line-height: 32px; letter-spacing: -.02em; }
.mobile-eyebrow { color: #8b5cf6; font-size: 10px; font-weight: 700; letter-spacing: .16em; line-height: 15px; }
.mobile-heading-action { min-height: 44px; padding: 0 14px; border: 1px solid #3b4a67; border-radius: 12px; color: #dbe5f3; background: #1b2940; font-size: 14px; }
.mobile-editor-page { position: relative; }
.mobile-editor-meta { display: flex; align-items: center; gap: 8px; flex: none; min-height: 34px; padding: 0 16px; color: #adbad0; background: #131d30; border-bottom: 1px solid #273650; }
.mobile-current-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #dfe7f4; font-size: 13px; }
.mobile-current-name { border:0; background:transparent; min-height:48px; text-align:left; }
.mobile-current-dim { flex: none; color: #71829d; font-size: 11px; font-variant-numeric: tabular-nums; }
.mobile-save-status { display: inline-flex; align-items: center; gap: 5px; flex: none; margin-left: auto; color: #8fa1ba; font-size: 11px; white-space: nowrap; }
.mobile-save-dot { width: 6px; height: 6px; border-radius: 50%; background: #71829d; }
.mobile-save-status.is-pending .mobile-save-dot, .mobile-save-status.is-saving .mobile-save-dot { background: #f0b44d; }
.mobile-save-status.is-saving .mobile-save-dot { animation: mobile-save-pulse 1s ease-in-out infinite; }
.mobile-save-status.is-saved .mobile-save-dot { background: #36c28a; }
.mobile-save-status.is-error { color: #f0a1a1; }
.mobile-save-status.is-error .mobile-save-dot { background: #dc6262; }
.mobile-export-page :deep(.export-panel) { flex: 1; min-height: 0; overflow: auto; }
.mobile-editor-tools { display: flex; align-items: stretch; justify-content: space-around; gap: 4px; flex: none; min-height: calc(68px + env(safe-area-inset-bottom)); padding: 6px 8px env(safe-area-inset-bottom); background: #121c2d; border-top: 1px solid #273650; }
.mobile-tool { display: flex; min-width: 56px; flex: 1; min-height: 56px; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: 0; border-radius: 12px; color: #9eacc0; background: transparent; font-size: 12px; }
.mobile-tool:active { color: #fff; background: #263650; }
.mobile-tool-icon { width: 22px; height: 22px; color: #bdc9da; }
.mobile-bottom-nav { display: flex; align-items: stretch; justify-content: space-around; flex: none; min-height: calc(68px + env(safe-area-inset-bottom)); padding: 4px 12px env(safe-area-inset-bottom); background: #121c2d; border-top: 1px solid #273650; }
.mobile-nav-item { display: flex; flex: 1; min-height: 56px; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: 0; border-radius: 12px; color: #7f90a8; background: transparent; font-size: 21px; }
.mobile-nav-item :deep(svg) { width: 22px; height: 22px; }
.mobile-nav-item small { font-size: 12px; line-height: 16px; }
.mobile-nav-item.active { color: #c4b5fd; background: rgba(124, 58, 237, .16); }
.mobile-sheet-layer { position: fixed; inset: 0; z-index: 1100; display: flex; align-items: flex-end; background: rgba(2, 6, 23, .62); }
.mobile-sheet { width: 100%; max-height: min(88dvh, 860px); overflow: hidden; display: flex; flex-direction: column; padding: 10px 0 calc(8px + env(safe-area-inset-bottom)); background: #151e30; border: 1px solid #30405d; border-bottom: 0; border-radius: 22px 22px 0 0; box-shadow: 0 -18px 64px rgba(0, 0, 0, .42); }
.mobile-sheet-handle { width: 42px; height: 4px; flex: none; margin: 0 auto 8px; border-radius: 99px; background: #52627d; }
.mobile-sheet-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex: none; padding: 4px 16px 12px; }
.mobile-sheet-header h2 { color: #f5f7fb; font-size: 19px; line-height: 24px; }
.mobile-sheet-actions { display: flex; align-items: center; gap: 5px; }
.mobile-sheet-reset, .mobile-sheet-close { min-width: 48px; min-height: 44px; border: 1px solid #34425e; border-radius: 11px; color: #becbe0; background: #202d44; font-size: 13px; }
.mobile-sheet-close { min-width: 44px; color: #d9e1ee; font-size: 24px; line-height: 1; }
.mobile-sheet-close :deep(svg) { width: 20px; height: 20px; }
.mobile-section-tabs { display: flex; gap: 4px; flex: none; margin: 0 16px 10px; padding: 4px; background: #0f1728; border: 1px solid #2c3b56; border-radius: 12px; }
.mobile-section-tabs button { min-height: 40px; flex: 1; border: 0; border-radius: 9px; color: #91a0b5; background: transparent; font-size: 14px; }
.mobile-section-tabs button.active { color: #fff; background: #7c3aed; }
.mobile-sheet :deep(.right-panels) { width: 100% !important; min-width: 0; max-width: none; height: auto; flex: 1; overflow: hidden; border: 0; background: transparent; direction: ltr; }
.mobile-sheet :deep(.right-panels > *) { direction: ltr; }
.mobile-sheet :deep(.panel-footer) { display: none; }
.mobile-sheet :deep(.mobile-panel-list) { min-height: 0; height: 100%; overflow: auto; padding: 0 16px 20px; }
.mobile-sheet :deep(.creative-panel) { padding: 0 0 16px; border-bottom: 0; }
.mobile-sheet :deep(.creative-panel > summary) { display: none; }
.mobile-sheet :deep(.creative-panel label), .mobile-sheet :deep(.creative-panel p) { font-size: 14px; line-height: 20px; }
.mobile-sheet :deep(.creative-panel input:not([type=checkbox])), .mobile-sheet :deep(.creative-panel select), .mobile-sheet :deep(.creative-panel textarea) { min-height: 48px; padding: 10px 12px; font-size: 15px; }
.mobile-sheet :deep(.creative-panel button) { min-height: 48px; font-size: 14px; }
.mobile-sheet :deep(.panel-control), .mobile-sheet :deep(.control-group) { max-width: none; }
.mobile-sheet :deep(input[type=range]) { min-height: 36px; }

@keyframes mobile-save-pulse { 50% { opacity: .35; } }

.mobile-sheet-enter-active, .mobile-sheet-leave-active { transition: opacity .2s ease; }
.mobile-sheet-enter-active .mobile-sheet, .mobile-sheet-leave-active .mobile-sheet { transition: transform .22s ease; }
.mobile-sheet-enter-from, .mobile-sheet-leave-to { opacity: 0; }
.mobile-sheet-enter-from .mobile-sheet, .mobile-sheet-leave-to .mobile-sheet { transform: translateY(100%); }
@media (orientation: landscape) and (max-height: 560px) {
  .mobile-topbar { min-height: calc(48px + env(safe-area-inset-top)); }
  .mobile-icon-button, .mobile-back, .mobile-export-button { min-height: 42px; }
  .mobile-editor-tools, .mobile-bottom-nav { min-height: 54px; padding-bottom: 2px; }
  .mobile-tool, .mobile-nav-item { min-height: 46px; }
  .mobile-sheet { max-height: 94dvh; }
}
/* 横屏时把参数面板移到右侧，保留左侧画布高度与宽度；仍使用同一个
   sheet 内容和滚动区域，避免为横屏复制一套编辑逻辑。 */
@media (orientation: landscape) and (max-height: 600px) {
  .mobile-shell { max-width:none; margin:0; }
  .mobile-shell.has-panel { padding-right:min(420px, 44vw); }
  .mobile-sheet-layer { align-items: stretch; justify-content: flex-end; left:auto; width:min(420px, 44vw); background:transparent; }
  .mobile-sheet {
    width: min(420px, 44vw);
    height: 100%;
    max-height: none;
    padding-top: calc(10px + env(safe-area-inset-top));
    padding-bottom: calc(8px + env(safe-area-inset-bottom));
    border-right: 0;
    border-bottom: 1px solid #30405d;
    border-radius: 22px 0 0 22px;
  }
  .mobile-sheet-handle { display: none; }
  .mobile-sheet-enter-from .mobile-sheet,
  .mobile-sheet-leave-to .mobile-sheet { transform: translateX(100%); }
}
@media (prefers-reduced-motion: reduce) {
  .mobile-save-status.is-saving .mobile-save-dot { animation: none; }
  .mobile-sheet-enter-active,
  .mobile-sheet-leave-active,
  .mobile-sheet-enter-active .mobile-sheet,
  .mobile-sheet-leave-active .mobile-sheet { transition: none; }
  .mobile-sheet-enter-from .mobile-sheet,
  .mobile-sheet-leave-to .mobile-sheet { transform: none; }
}
@media (max-width: 380px) {
  .mobile-editor-meta { gap: 5px; padding-inline: 12px; }
  .mobile-current-dim { display: none; }
  .mobile-save-status { font-size: 10px; }
  .mobile-page-heading { padding-inline: 12px; }
}
@media (min-width: 721px) and (orientation: portrait) {
  .mobile-shell { max-width: 720px; margin: 0 auto; border-left: 1px solid #273650; border-right: 1px solid #273650; }
}
/* Never reduce Android touch targets to fit landscape; reclaim branding instead. */
.mobile-heading-action, .mobile-sheet-reset, .mobile-sheet-close,
.mobile-section-tabs button, .mobile-icon-button, .mobile-back,
.mobile-export-button, .mobile-tool, .mobile-nav-item {
  min-height: 48px;
  min-width: 48px;
}
.mobile-shell { font-size: 16px; }
.mobile-sheet :deep(input:not([type=checkbox])), .mobile-sheet :deep(select),
.mobile-sheet :deep(textarea) { font-size: 16px; }
</style>
