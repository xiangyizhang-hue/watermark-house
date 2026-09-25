import { ref } from 'vue'
import { isMobile } from './env'

export type MobilePersistenceState = 'ready' | 'pending' | 'saving' | 'saved' | 'error'

/**
 * 移动端本地保存状态。它是 UI 提示，不是数据源；真正的编辑数据仍由
 * IndexedDB 历史链保存。把状态单独暴露出来，避免“看起来保存了”但实际失败。
 */
export const mobilePersistenceState = ref<MobilePersistenceState>('ready')
let editRevision = 0

export function markMobileDirty(): void {
  if (isMobile) {
    editRevision++
    mobilePersistenceState.value = 'pending'
  }
}

export function mobileEditRevision(): number { return editRevision }

export function markMobileSaved(revision = editRevision): void {
  if (isMobile && revision === editRevision) mobilePersistenceState.value = 'saved'
}

export function markMobileSaveError(): void {
  if (isMobile) mobilePersistenceState.value = 'error'
}

/**
 * 绑定 Android WebView 生命周期保存钩子。
 * visibilitychange/pagehide/freeze 都可能早于进程回收，统一复用同一条串行保存链，
 * 防止多个生命周期事件并发写同一条 IndexedDB 历史。
 */
export function installMobilePersistence(flush: () => Promise<void>): () => void {
  if (!isMobile || typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {}
  }

  let inFlight: Promise<void> | null = null
  const persist = (): Promise<void> => {
    if (inFlight) return inFlight
    mobilePersistenceState.value = 'saving'
    const revision = editRevision
    inFlight = Promise.resolve().then(flush)
      .then(() => {
        mobilePersistenceState.value = revision === editRevision ? 'saved' : 'pending'
      })
      .catch((error) => {
        mobilePersistenceState.value = 'error'
        throw error
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void persist().catch(() => {})
  }
  const onPageHide = () => {
    void persist().catch(() => {})
  }
  const onFreeze = () => {
    void persist().catch(() => {})
  }

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('freeze', onFreeze)

  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('freeze', onFreeze)
  }
}
