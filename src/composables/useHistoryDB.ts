// 修改历史记录持久层：原生 IndexedDB，每张图片一条独立历史链表。
// 每条历史节点存储：{ id, photoId, name, ts, seq, state }
//  - state 为该时刻的完整 FrameConfig 参数快照（非增量 diff）
//  - seq 为全局单调递增序号，用于保证链表顺序（底部最早 → 顶部最新）
// 链表的"头部追加/跳转截断/清上"等语义由 useHistory 在内存中维护，此处仅负责存取。
import type { FrameConfig } from '../core/types'
import { photoIdentity } from '../core/photoIdentity'
import { isAndroid, isTauri } from '../platform/env'

const nativeHistory = isAndroid && isTauri
let nativeReady: Promise<void> | null = null
async function nativeQuery<T>(operation: string, payload: object = {}): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  const result = await invoke<string>('mobile_history', { operation, payload: JSON.stringify(payload) })
  return JSON.parse(result) as T
}

/** Copy old history in bounded batches. Never delete IndexedDB during migration. */
async function ensureNativeHistory(): Promise<void> {
  if (!nativeReady) nativeReady = (async () => {
    if (await nativeQuery<boolean>('migrated')) return
    const db = await openDB()
    let after: IDBValidKey | undefined
    for (;;) {
      const batch = await new Promise<HistoryNodeRecord[]>((resolve, reject) => {
        const req = store(db, 'readonly').getAll(after === undefined ? undefined : IDBKeyRange.lowerBound(after, true), 64)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      if (!batch.length) break
      await nativeQuery('import', { nodes: batch })
      after = batch[batch.length - 1].id
    }
    await nativeQuery('finishMigration')
  })().catch(error => { nativeReady = null; throw error })
  await nativeReady
}

async function historyQuery<T>(operation: string, payload: object = {}): Promise<T> {
  await ensureNativeHistory()
  return nativeQuery<T>(operation, payload)
}

export async function loadHistoryCursor(photoId: string): Promise<string | null> {
  if (nativeHistory) {
    const saved = await historyQuery<string | null>('getCursor', { photoId })
    if (saved !== null) return saved
    // One-time migration of the undo position, independently of the history nodes.
    const legacy = localStorage.getItem(`frame-cursor:${photoId}`)
    if (legacy) await historyQuery('setCursor', { photoId, nodeId: legacy })
    return legacy
  }
  return localStorage.getItem(`frame-cursor:${photoId}`)
}

export async function saveHistoryCursor(photoId: string, nodeId: string): Promise<void> {
  if (nativeHistory) { await historyQuery('setCursor', { photoId, nodeId }); return }
  localStorage.setItem(`frame-cursor:${photoId}`, nodeId)
}

const DB_NAME = 'frame-history'
const STORE = 'nodes'
const VERSION = 1

export interface HistoryNodeRecord {
  id: string
  photoId: string
  /** 显示名称（如 "导入"、"背景模糊"、"复位"） */
  name: string
  ts: number
  /** 全局单调递增序号，链表排序依据 */
  seq: number
  /** 该时刻完整参数快照 */
  state: FrameConfig
}

let dbPromise: Promise<IDBDatabase> | null = null
// 全局 seq 计数：加载节点时以最大 seq 为起点，保证新增节点序号单调
let globalSeq = 0

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        // 按照片 id 索引：取某张照片的整条链表
        store.createIndex('photoId', 'photoId', { unique: false })
      }
    }
    req.onsuccess = () => {
      globalSeq = 0 // 重新打开后由 load 阶段重建
      const db = req.result
      // 其它标签页请求升级 / 清理站点数据时主动关闭本连接（否则阻塞对端，本端事务也开始报错）
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    // 失败不缓存 rejected promise——否则本次会话所有历史读写永久失败且无重试机会
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
    // 被其它标签页旧连接阻塞：等待其收到 versionchange 后自行关闭（不 reject，避免误报）
    req.onblocked = () => {
      /* 等待对端关闭连接 */
    }
  })
  return dbPromise
}

function store(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE)
}

/** 记录 seq 起点：任意一次读取后调用，确保后续新增节点 seq 严格递增 */
export function trackSeq(recs: { seq: number }[]): void {
  for (const r of recs) {
    if (r.seq > globalSeq) globalSeq = r.seq
  }
}

export function nextSeq(): number {
  // 审查报告 S17：seq 改为「毫秒时间戳 ×1000 + 进程内自增」——跨标签页也单调，
  // 多标签同时编辑同一照片时不再产生相同 seq（排序退化为键序）
  globalSeq = Math.max(globalSeq + 1, Date.now() * 1000)
  return globalSeq
}

/** 读取某张照片的整条历史链表（按 seq 升序 = 底部 Import 最早 → 顶部最新） */
export async function loadPhotoNodes(photoId: string): Promise<HistoryNodeRecord[]> {
  if (nativeHistory) {
    const nodes = await historyQuery<HistoryNodeRecord[]>('list', { photoId })
    trackSeq(nodes)
    return nodes
  }
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = store(db, 'readonly').index('photoId').getAll(photoId)
    req.onsuccess = () => {
      const recs = (req.result as HistoryNodeRecord[]).sort((a, b) => a.seq - b.seq)
      trackSeq(recs)
      resolve(recs)
    }
    req.onerror = () => reject(req.error)
  })
}

/** 写入/更新一条历史节点 */
export async function putHistoryNode(rec: HistoryNodeRecord): Promise<void> {
  if (nativeHistory) { await historyQuery('put', { node: rec }); return }
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(JSON.parse(JSON.stringify(rec)))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('历史事务被中止'))
  })
}

let legacyRecords: Promise<HistoryNodeRecord[]> | undefined
/** Recover only chains whose last edited state's source explicitly identifies this path. */
export async function recoverLegacyNodes(photoId: string): Promise<HistoryNodeRecord[]> {
  // Android migrated the entire legacy database already. Never resurrect deleted
  // native records from the retained migration backup.
  if (nativeHistory) return []
  if (!photoId.startsWith('photo:')) return []
  if (!legacyRecords) legacyRecords = openDB().then(db => new Promise<HistoryNodeRecord[]>((resolve,reject) => {
    const req = store(db,'readonly').getAll()
      req.onsuccess = () => resolve(req.result.filter((r: HistoryNodeRecord) => !r.photoId.startsWith('photo:') && !r.photoId.startsWith('copy:')))
    req.onerror = () => reject(req.error)
  }))
  const records = await legacyRecords
  const latest = new Map<string,HistoryNodeRecord>()
  for (const r of records) if (!latest.has(r.photoId) || latest.get(r.photoId)!.seq < r.seq) latest.set(r.photoId,r)
  const matches = [...latest.values()].filter(r => {
    if (r.name === '导入' || !r.state.photoSrc) return false
    try {
      const src = r.state.photoSrc
      if (!/^(https?:\/\/asset\.localhost\/|asset:\/\/localhost\/)/.test(src)) return false
      return photoIdentity(decodeURIComponent(src.replace(/^(https?:\/\/asset\.localhost\/|asset:\/\/localhost\/)/,''))) === photoId
    } catch { return false }
  }).sort((a,b) => b.seq-a.seq)
  const hit = matches[0]
  if (!hit) return []
  const restored = records.filter(r => r.photoId === hit.photoId).sort((a,b) => a.seq-b.seq).map(r => ({...r, id: `${photoId}:${r.id}`, photoId}))
  for (const rec of restored) await putHistoryNode(rec)
  trackSeq(restored)
  return restored
}

/** 批量删除指定节点（清除历史上方 / 截断分支用） */
export async function deleteHistoryNodes(ids: string[]): Promise<void> {
  if (!ids.length) return
  if (nativeHistory) { await historyQuery('deleteIds', { ids }); return }
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite')
    const s = t.objectStore(STORE)
    ids.forEach((id) => s.delete(id))
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

/** 删除单张照片的整条历史链表 */
export async function deletePhotoChain(photoId: string): Promise<void> {
  if (nativeHistory) { await historyQuery('deletePhotos', { ids: [photoId] }); return }
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite')
    const s = t.objectStore(STORE)
    const req = s.index('photoId').getAllKeys(photoId)
    req.onsuccess = () => {
      const keys = req.result as string[]
      keys.forEach((k) => s.delete(k))
      t.oncomplete = () => resolve()
    }
    t.onerror = () => reject(t.error)
  })
}

/** 批量删除多张照片的历史链表（防数据库无限膨胀 / 批量清除接口） */
export async function deletePhotoChains(photoIds: string[]): Promise<void> {
  if (nativeHistory) { await historyQuery('deletePhotos', { ids: photoIds }); return }
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite')
    const s = t.objectStore(STORE)
    const seen = new Set<string>()
    photoIds.forEach((pid) => {
      if (seen.has(pid)) return
      seen.add(pid)
      const req = s.index('photoId').getAllKeys(pid)
      req.onsuccess = () => {
        const keys = req.result as string[]
        keys.forEach((k) => s.delete(k))
      }
    })
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

/** 统计所有历史节点数量（监控数据库膨胀） */
export async function countHistoryNodes(): Promise<number> {
  if (nativeHistory) return historyQuery<number>('count')
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = store(db, 'readonly').count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 清空全部历史节点（全局清理接口） */
export async function clearAllHistoryNodes(): Promise<void> {
  if (nativeHistory) { await historyQuery('clear'); return }
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = store(db, 'readwrite').clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
