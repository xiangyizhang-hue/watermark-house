// Android 本地原图仓库。
//
// 这里保存的是原图 Blob 和编辑所需的轻量元数据，不保存临时 object URL。
// URL 只在当前进程启动时重新创建，因此切换应用、锁屏、重启后都不会因为
// Photo Picker 返回的临时 URI 失效而把图库恢复成空白。
// Android 使用私有文件 + SQLite；浏览器保持 IndexedDB，旧库只作迁移备份。
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { isAndroid, isTauri } from './env'
const nativeAssets = isAndroid && isTauri

export const MOBILE_ASSET_DB = 'framelab-mobile-assets'
export const MOBILE_ASSET_STORE = 'assets'
export const MOBILE_COPY_STORE = 'copies'
const DB_VERSION = 2

export interface MobileAssetRecord {
  id: string
  name: string
  type: string
  size: number
  width: number
  height: number
  blob?: Blob
  originalPath?: string
  thumbPath?: string
  exif: unknown | null
  createdAt: number
  updatedAt: number
}

/**
 * 虚拟副本只保存轻量关系，不复制原图 Blob。
 * sourceId 永远指向原图，副本的编辑历史仍由 useHistory 独立保存。
 */
export interface MobileCopyRecord {
  id: string
  sourceId: string
  name: string
  createdAt: number
  updatedAt: number
}

async function nativeQuery<T>(operation: string, payload: object = {}): Promise<T> {
  return JSON.parse(await invoke<string>('mobile_assets', { operation, payload: JSON.stringify(payload) })) as T
}

async function encodeChunk(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(reader.error ?? new Error('读取原图分块失败'))
    reader.readAsDataURL(blob)
  })
}

async function saveNativeAsset(record: MobileAssetRecord): Promise<void> {
  if (!record.blob) throw new Error('缺少原图内容')
  const { blob, originalPath: _oldPath, ...metadata } = record
  const token = await nativeQuery<string>('begin', { metadata })
  try {
    for (let offset = 0; offset < blob.size; offset += 512 * 1024) {
      await nativeQuery('chunk', { token, data: await encodeChunk(blob.slice(offset, offset + 512 * 1024)) })
    }
    const saved = await nativeQuery<MobileAssetRecord>('finish', { token })
    if (!saved.originalPath) throw new Error('原图存储未返回稳定路径')
    record.originalPath = saved.originalPath
    record.thumbPath = saved.thumbPath
  } catch (error) {
    await nativeQuery('abort', { token }).catch(() => {})
    throw error
  }
}

let migration: Promise<void> | null = null
async function ensureNativeAssets(): Promise<void> {
  if (!migration) migration = (async () => {
    if (await nativeQuery<boolean>('migrated')) return
    const db = await openDb()
    if (!db) throw new Error('无法打开旧图库')
    try {
      // Only one original Blob is transferred at a time, including after restart.
      for (const storeName of [MOBILE_ASSET_STORE, MOBILE_COPY_STORE]) {
        let after: string | undefined
        for (;;) {
          const rows = await requestResult(db.transaction(storeName, 'readonly').objectStore(storeName)
            .getAll(after === undefined ? undefined : IDBKeyRange.lowerBound(after, true), 1)) as (MobileAssetRecord | MobileCopyRecord)[]
          if (!rows.length) break
          const record = rows[0]
          if (storeName === MOBILE_ASSET_STORE) {
            if (!await nativeQuery<boolean>('exists', { id: record.id })) await saveNativeAsset(record as MobileAssetRecord)
          } else if (await nativeQuery<boolean>('exists', { id: (record as MobileCopyRecord).sourceId })) {
            await nativeQuery('saveCopy', { record })
          }
          after = record.id
        }
      }
      await nativeQuery('finishMigration')
    } finally { db.close() }
  })().catch(error => { migration = null; throw error })
  await migration
}

async function assetQuery<T>(operation: string, payload: object = {}): Promise<T> {
  await ensureNativeAssets()
  return nativeQuery<T>(operation, payload)
}

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return Promise.reject(new Error('本地图片存储不可用，照片尚未保存，请勿关闭应用'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MOBILE_ASSET_DB, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(MOBILE_ASSET_STORE)) {
        const store = db.createObjectStore(MOBILE_ASSET_STORE, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(MOBILE_COPY_STORE)) {
        const store = db.createObjectStore(MOBILE_COPY_STORE, { keyPath: 'id' })
        store.createIndex('sourceId', 'sourceId', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('打开移动端图片仓库失败'))
    request.onblocked = () => reject(new Error('移动端图片仓库被旧版本占用'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('移动端图片仓库操作失败'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | null,
  storeName = MOBILE_ASSET_STORE,
): Promise<T | null> {
  const db = await openDb()
  if (!db) return null
  try {
    const tx = db.transaction(storeName, mode)
    const result = run(tx.objectStore(storeName))
    if (!result) {
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('移动端图片仓库事务失败'))
        tx.onabort = () => reject(tx.error ?? new Error('移动端图片仓库事务已取消'))
      })
      return null
    }
    const value = await requestResult(result)
    // request 成功不代表事务已经提交；等待 complete，保证成功提示不会早于落盘。
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('移动端图片仓库提交失败'))
      tx.onabort = () => reject(tx.error ?? new Error('移动端图片仓库事务已取消'))
    })
    return value
  } finally {
    db.close()
  }
}

/** 保存一份原图；同 id 写入用于补回 EXIF，不会创建临时 URL。 */
export async function saveMobileAsset(record: MobileAssetRecord): Promise<void> {
  if (nativeAssets) { await ensureNativeAssets(); await saveNativeAsset(record); return }
  const result = await withStore('readwrite', (store) => store.put(record))
  // IndexedDB 不存在时只在浏览器测试/旧环境降级；Android WebView 应该始终支持它，
  // 由上层决定是否向用户报告不可持久化，而不是静默把照片当成临时文件。
  if (result === null && !canUseIndexedDb()) return
}

export async function updateMobileAsset(
  id: string,
  patch: Partial<Pick<MobileAssetRecord, 'exif' | 'name' | 'updatedAt'>>,
): Promise<void> {
  if (nativeAssets) { await assetQuery('update', { id, patch }); return }
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction(MOBILE_ASSET_STORE, 'readwrite')
    const store = tx.objectStore(MOBILE_ASSET_STORE)
    const current = await requestResult(store.get(id))
    if (current) store.put({ ...current, ...patch, updatedAt: patch.updatedAt ?? Date.now() })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('更新移动端图片信息失败'))
      tx.onabort = () => reject(tx.error ?? new Error('更新移动端图片信息已取消'))
    })
  } finally {
    db.close()
  }
}

export async function listMobileAssets(): Promise<MobileAssetRecord[]> {
  if (nativeAssets) return (await assetQuery<MobileAssetRecord[]>('list')).sort((a, b) => a.createdAt - b.createdAt)
  const result = await withStore('readonly', (store) => store.getAll())
  if (!result) return []
  return (result as unknown as MobileAssetRecord[])
    .filter((item) => item && typeof item.id === 'string' && item.blob instanceof Blob)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export async function deleteMobileAsset(id: string): Promise<void> {
  if (nativeAssets) { await assetQuery('delete', { id }); return }
  await withStore('readwrite', (store) => store.delete(id))
}

export async function clearMobileAssets(): Promise<void> {
  if (nativeAssets) { await assetQuery('clear'); return }
  await withStore('readwrite', (store) => store.clear())
}

/** 保存虚拟副本元数据；原图仍只保留一份。 */
export async function saveMobileCopy(record: MobileCopyRecord): Promise<void> {
  if (nativeAssets) { await assetQuery('saveCopy', { record }); return }
  const result = await withStore('readwrite', (store) => store.put(record), MOBILE_COPY_STORE)
  if (result === null && !canUseIndexedDb()) return
}

/** 读取全部虚拟副本，顺序与创建时间一致。 */
export async function listMobileCopies(): Promise<MobileCopyRecord[]> {
  if (nativeAssets) return (await assetQuery<MobileCopyRecord[]>('listCopies')).sort((a, b) => a.createdAt - b.createdAt)
  const result = await withStore('readonly', (store) => store.getAll(), MOBILE_COPY_STORE)
  if (!result) return []
  return (result as unknown as MobileCopyRecord[])
    .filter(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.sourceId === 'string' &&
        typeof item.name === 'string',
    )
    .sort((a, b) => a.createdAt - b.createdAt)
}

export async function deleteMobileCopy(id: string): Promise<void> {
  if (nativeAssets) { await assetQuery('deleteCopy', { id }); return }
  await withStore('readwrite', (store) => store.delete(id), MOBILE_COPY_STORE)
}

export async function clearMobileCopies(): Promise<void> {
  if (nativeAssets) { await assetQuery('clearCopies'); return }
  await withStore('readwrite', (store) => store.clear(), MOBILE_COPY_STORE)
}

/** 每次进程启动时为已持久化的原图建立新的 object URL。 */
export function createMobileAssetUrl(blob?: Blob, originalPath?: string): string {
  if (nativeAssets && originalPath) return convertFileSrc(originalPath)
  if (!blob) throw new Error('找不到原图内容或本地路径')
  if (typeof URL.createObjectURL !== 'function') {
    throw new Error('当前 Android WebView 不支持本地图片 URL')
  }
  return URL.createObjectURL(blob)
}

export function revokeMobileAssetUrl(url?: string): void {
  if (url?.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
}

export function mobileRecordFile(record: MobileAssetRecord): File | null {
  if (!record.blob) return null
  try {
    return new File([record.blob], record.name, {
      type: record.type || record.blob.type || 'image/*',
      lastModified: record.updatedAt || record.createdAt || Date.now(),
    })
  } catch {
    // 极老 WebView 没有 File 构造器时，Blob 仍可用于导出读取。
    return record.blob as File
  }
}
