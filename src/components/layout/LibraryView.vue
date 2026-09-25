<script setup lang="ts">
// 图库模块：网格缩略图管理素材，支持拖拽/点击导入、多选、移除，点击进编辑。
// 移除语义（同 LrC）：仅从软件图库中移除引用与编辑记录，磁盘上的原文件不会被删除。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useLibrary } from '../../composables/useLibrary'
import { useAppState } from '../../composables/useAppState'
import { isDesktopTauri, isMobile } from '../../platform/env'
import { addLocalEntries, onDropImageFiles, pickImageFiles } from '../../platform/fs'
import GlassModal from '../common/GlassModal.vue'
import PhotoCopyMenu from '../common/PhotoCopyMenu.vue'
import Icon from '../common/Icon.vue'
const copyMenu = ref<InstanceType<typeof PhotoCopyMenu>>()

const library = useLibrary()
const app = useAppState()

const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const selectionMode = ref(false)

const selectedCount = computed(() => library.items.filter((i) => i.selected).length)

// 「导入」按钮：桌面端走系统对话框拿磁盘路径（进 catalog 持久化，重启可还原），
// 与菜单「导入照片…」同链路；网页端保留 file input（blob 引用，无持久化能力）。
async function onImportClick(): Promise<void> {
  if (importing.value) return
  if (isDesktopTauri) {
    const list = await pickImageFiles()
    if (list.length) await addLocalEntries(list)
  } else {
    fileInput.value?.click()
  }
}

// 拖拽：桌面端监听 Tauri 原生拖放（真实磁盘路径导入），网页端走 HTML5 drop（addFiles）。
// 桌面端 drag_and_drop 开启后 HTML5 drop 事件不再触发，模板上的 @drop 仅网页端生效。
let unlistenDrop: (() => void) | null = null
let disposed = false
onMounted(async () => {
  if (!isDesktopTauri) return
  const off = await onDropImageFiles(
    (over) => {
      dragOver.value = over
    },
    (entries) => {
      void addLocalEntries(entries)
    },
  )
  // 审查报告 U7：注册期间组件可能已卸载（await 竞态）——此时立即注销，避免监听泄漏
  if (disposed) {
    off()
    return
  }
  unlistenDrop = off
})
onBeforeUnmount(() => {
  disposed = true
  unlistenDrop?.()
  unlistenDrop = null
})

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  importing.value = true
  try {
    if (input.files) {
      // Android Photo Picker grants are tied to the selected input files.
      // Keep them alive until original bytes and metadata have been persisted.
      await library.addFiles(Array.from(input.files))
    }
  } finally {
    input.value = ''
    importing.value = false
  }
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  if (e.dataTransfer?.files) {
    void library.addFiles(Array.from(e.dataTransfer.files))
  }
}

// 与胶片条一致的多选逻辑：Ctrl/⌘+点击切换勾选；Shift+点击从锚点范围勾选；
// 普通点击仅切换预览（不改动勾选集合——勾选是导出/移除的凭据，浏览不能静默清掉）
function onItemClick(item: { id: string }, e: MouseEvent) {
  if (isMobile && selectionMode.value) { library.toggleSelect(item.id); return }
  if (e.metaKey || e.ctrlKey) {
    library.toggleSelect(item.id)
    return
  }
  if (e.shiftKey) library.rangeSelect(item.id)
  else enterDevelop(item)
}

function enterDevelop(item: { id: string }) {
  library.select(item.id)
  app.setModule('develop')
}

// ===== 移除确认（LrC 语义：仅从图库移除，不删磁盘原文件）=====
const confirmOpen = ref(false)
type PendingAction = 'removeSelected' | 'clearAll'
let pendingAction: PendingAction = 'removeSelected'
const confirmMsg = computed(() => {
  const tail = '仅从软件图库中移除引用与编辑记录，磁盘上的原文件不会被删除。'
  return pendingAction === 'removeSelected'
    ? `将从图库移除选中的 ${selectedCount.value} 张照片。${tail}`
    : `将清空图库中的全部 ${library.items.length} 张照片。${tail}`
})
function askRemoveSelected() {
  if (!selectedCount.value) return
  pendingAction = 'removeSelected'
  confirmOpen.value = true
}
function askClearAll() {
  if (!library.items.length) return
  pendingAction = 'clearAll'
  confirmOpen.value = true
}
function onConfirmRemove() {
  confirmOpen.value = false
  if (pendingAction === 'removeSelected') library.removeSelected()
  else library.clearAll()
}
</script>

<template>
  <div class="library-view">
    <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onPick" />
    <div
      class="dropzone"
      :class="{ over: dragOver }"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <div v-if="library.items.length === 0" class="empty">
        <h2>图库</h2>
        <p>{{ isMobile ? '从相册选择照片，开始添加水印' : '拖拽照片到此处，或点击导入' }}</p>
        <div class="empty-actions">
          <button class="btn-primary" :disabled="importing" @click="onImportClick">{{ importing ? '导入中…' : '导入照片' }}</button>
        </div>
      </div>

      <template v-else>
        <div v-if="isMobile" class="lib-toolbar mobile-library-toolbar">
          <button class="btn" :disabled="importing" @click="onImportClick">{{ importing ? '导入中…' : '导入照片' }}</button>
          <span class="spacer" />
          <button class="btn" :aria-pressed="selectionMode" @click="selectionMode = !selectionMode">{{ selectionMode ? '完成选择' : '选择' }}</button>
          <template v-if="selectionMode">
            <span class="count">已选 {{ selectedCount }} 张</span>
            <button class="btn" @click="library.selectAll">全选</button>
            <button class="btn" @click="library.selectNone">取消全选</button>
            <button class="btn" :disabled="!selectedCount" @click="askRemoveSelected">移除选中</button>
          </template>
        </div>
        <div v-else class="lib-toolbar">
          <button class="btn" :disabled="importing" @click="onImportClick">{{ importing ? '导入中…' : '＋ 导入' }}</button>
          <button class="btn" @click="library.selectAll">全选</button>
          <button class="btn" @click="library.selectNone">取消全选</button>
          <span class="count" title="Ctrl+点击勾选/取消 · Shift+点击范围勾选 · 普通点击仅预览，不改变勾选">共 {{ library.items.length }} 张 · 已选 {{ selectedCount }}</span>
          <span class="spacer" />
          <button class="btn" :disabled="!selectedCount" title="仅从图库移除，不删除磁盘原文件" @click="askRemoveSelected">移除选中</button>
          <button class="btn" title="仅从图库移除全部照片，不删除磁盘原文件" @click="askClearAll">清空图库</button>
        </div>

        <div class="grid">
          <div
            v-for="item in library.items"
            :key="item.id"
            v-memo="[item.id, item.thumbUrl, item.selected, item.id === library.activeId.value, selectionMode]"
            class="cell"
            :class="{ selected: item.selected && (!isMobile || selectionMode), active: item.id === library.activeId.value }"
            @click="onItemClick(item, $event)"
            @dblclick="enterDevelop(item)"
            @contextmenu="copyMenu?.open($event,item.id)"
          >
            <img v-if="item.thumbUrl" :src="item.thumbUrl" :alt="item.name" loading="lazy" />
            <div v-else class="thumb-placeholder" />
            <label v-if="!isMobile || selectionMode" class="photo-check" @click.stop><input type="checkbox" :aria-label="`选择 ${item.name}`" :checked="item.selected" @change="library.toggleSelect(item.id)"> 选择</label>
            <div class="meta">
              <span class="name">{{ item.name }}</span>
              <span class="dim">{{ item.width }}×{{ item.height }}</span>
            </div>
            <div class="cell-actions">
            <button v-if="!isMobile" class="enter" title="进入编辑" @click.stop="enterDevelop(item)">编辑</button>
            <button
              v-if="isMobile"
              class="cell-more"
              type="button"
              :aria-label="`打开 ${item.name} 的照片操作`"
              title="照片操作"
              @click.stop="copyMenu?.open($event, item.id)"
            ><Icon name="more" /></button>
            </div>
          </div>
        </div>
      </template>
    </div>
    <GlassModal
      v-model="confirmOpen"
      title="从图库移除"
      :message="confirmMsg"
      confirm-text="移除"
      cancel-text="取消"
      @confirm="onConfirmRemove"
    />
    <PhotoCopyMenu ref="copyMenu" />
  </div>
</template>

<style scoped>
.cell-actions { display:contents; }
.photo-check { position: absolute; top: 8px; left: 8px; padding: 5px; background: #000b; color: white; border-radius: 5px; z-index: 2; }
.library-view {
  height: 100%;
  /* 撑满父容器（.body 为 flex 行布局，flex item 默认宽度随内容收缩），
     否则空状态提示无法在整页居中 */
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
}
.dropzone {
  flex: 1;
  overflow: auto;
  padding: 16px;
  border: 2px dashed transparent;
  transition: border-color 0.15s, background 0.15s;
}
.dropzone.over {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-dim);
}
.btn-primary {
  margin-top: 8px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 14px;
  cursor: pointer;
}
.empty-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.btn-primary.ghost {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
}
.folder {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 400;
  line-height: 16px;
}
.lib-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.spacer {
  flex: 1;
}
.count {
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
}
.btn {
  background: var(--panel-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 0;
  padding: 0 14px;
  height: 22px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
}
.btn:hover { background: var(--hover); color: var(--text-normal); }
.btn:active { background: var(--pressed); }
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}
.cell {
  position: relative;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 0;
  overflow: hidden;
  cursor: pointer;
}
.cell:hover {
  background: var(--hover);
  border-color: var(--border);
}
.cell.selected {
  background: var(--accent);
  border-color: var(--accent);
}
.cell img {
  width: 100%;
  height: 110px;
  object-fit: cover;
  display: block;
  background: var(--canvas-empty);
}
/* 缩略图未就绪占位（不再回退原图，避免大图解码 OOM） */
.cell .thumb-placeholder {
  width: 100%;
  height: 110px;
  background: var(--canvas-empty);
}
.meta {
  display: flex;
  justify-content: space-between;
  padding: 0 8px;
  height: 22px;
  align-items: center;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-dim);
  line-height: 16px;
}
.meta .name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 65%;
}
.enter {
  position: absolute;
  top: 4px;
  right: 4px;
  background: var(--shell);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 0;
  padding: 0 6px;
  height: 18px;
  font-size: 11px;
  font-weight: 400;
  line-height: 14px;
  cursor: pointer;
  opacity: 0;
}
.enter:hover { background: var(--hover); }
.cell:hover .enter {
  opacity: 1;
}
.cell-more {
  display: none;
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, .28);
  border-radius: 11px;
  color: #fff;
  background: rgba(10, 16, 28, .76);
  cursor: pointer;
}
.cell-more :deep(svg) { width: 20px; height: 20px; }
.cell-more:active { background: rgba(124, 58, 237, .85); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 720px) {
  .cell-more { display: inline-flex; }
  .cell .enter { top: auto; right: 8px; bottom: 46px; min-width: 52px; min-height: 36px; opacity: .95; }
}
</style>
