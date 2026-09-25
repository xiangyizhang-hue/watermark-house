// 移动端批量导出队列的轻量持久层。
//
// 这里不保存原图，只保存导出参数快照、照片 id 和游标。原图由 mobileAssets.ts
// 管理；应用被系统回收后重新打开导出页即可从 cursor 继续。真正的 Android
// 前台媒体处理服务接入后可复用同一份 Job 结构，把执行器换成 Kotlin/Rust 即可。
import type { FrameConfig } from '../core/types'
import type { ExportFormat } from '../core/exporter'
import { isAndroid, isTauri } from './env'
import { deleteMobileNativeRecord, loadMobileNativeRecord, saveMobileNativeRecord } from './mobileNativeStore'

const STORAGE_KEY = 'framelab-mobile-export-job-v1'
const NATIVE_RECORD_KEY = 'export-job'

export interface MobileExportJob {
  version: 1
  /** 同一批任务的稳定标识，用于恢复时复用输出文件名，降低重复成片。 */
  jobId?: string
  status: 'running' | 'paused'
  ids: string[]
  cursor: number
  format: ExportFormat
  jpgQuality: number
  supersample: number
  backfillExif: boolean
  rulesEnabled: boolean
  rulesText: string
  /** 开始批量时冻结的全局编辑配置，避免切后台后参数被其它操作改掉。 */
  baseConfig: FrameConfig
  /** 每张照片在启动队列时的独立编辑快照；缺失时回退到 baseConfig。 */
  configs?: Record<string, FrameConfig>
  /** 已经成功写出的照片；进程在“写盘成功、游标落盘”之间被杀时可跳过重做。 */
  completed?: Record<string, { name: string; location: string | null; savedAt: number }>
  updatedAt: number
}

function createJobId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    /* old WebView: timestamp fallback below */
  }
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 给旧版本队列补齐恢复字段；不改变外部可见的 version，便于平滑升级。 */
export function normalizeMobileExportJob(job: MobileExportJob): MobileExportJob {
  return {
    ...job,
    jobId: job.jobId || createJobId(),
    completed: job.completed ? { ...job.completed } : {},
  }
}

/** Attempted is not completed: failed photos before the cursor must remain retryable. */
export function mobileExportResumeCursor(job: MobileExportJob): number {
  const firstPending = job.ids.findIndex(id => !job.completed?.[id])
  return firstPending < 0 ? job.ids.length : Math.min(job.cursor, firstPending)
}

export function mobileExportJobComplete(job: MobileExportJob): boolean {
  return job.ids.every(id => !!job.completed?.[id])
}

function validJob(value: unknown): value is MobileExportJob {
  if (!value || typeof value !== 'object') return false
  const job = value as Partial<MobileExportJob>
  return (
    job.version === 1 &&
    (job.status === 'running' || job.status === 'paused') &&
    Array.isArray(job.ids) &&
    job.ids.every((id) => typeof id === 'string') &&
    typeof job.cursor === 'number' && Number.isInteger(job.cursor) &&
    job.cursor >= 0 &&
    job.cursor <= job.ids.length &&
    !!job.baseConfig && typeof job.baseConfig === 'object' && !Array.isArray(job.baseConfig) &&
    typeof job.jpgQuality === 'number' && Number.isFinite(job.jpgQuality) && job.jpgQuality > 0 && job.jpgQuality <= 1 &&
    typeof job.supersample === 'number' && Number.isFinite(job.supersample) && job.supersample > 0 &&
    typeof job.updatedAt === 'number' && Number.isFinite(job.updatedAt) &&
    (job.format === 'jpg' || job.format === 'png') &&
    (job.configs === undefined || (typeof job.configs === 'object' && !Array.isArray(job.configs))) &&
    (job.completed === undefined || (typeof job.completed === 'object' && !Array.isArray(job.completed)))
  )
}

export function loadMobileExportJob(): MobileExportJob | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return validJob(parsed) ? normalizeMobileExportJob(parsed) : null
  } catch {
    return null
  }
}

/**
 * 保存队列并返回是否成功。移动端退出/进程被回收前，调用方可以据此明确提示
 * “无法续传”，而不是把任务看起来当成已持久化。
 */
let pendingMutation: Promise<unknown> = Promise.resolve()

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingMutation.then(operation, operation)
  pendingMutation = result.catch(() => undefined)
  return result
}

export function saveMobileExportJob(job: MobileExportJob): Promise<boolean> {
  const next = normalizeMobileExportJob(job)
  const serialized = JSON.stringify({ ...next, updatedAt: Date.now() })
  return serializeMutation(async () => {
    const native = isAndroid && isTauri
    if (native && !await saveMobileNativeRecord(NATIVE_RECORD_KEY, serialized, next.version)) return false
    try { localStorage.setItem(STORAGE_KEY, serialized) } catch { return native }
    return true
  })
}

export function clearMobileExportJob(): Promise<boolean> {
  return serializeMutation(async () => {
    const native = isAndroid && isTauri
    if (native && !await deleteMobileNativeRecord(NATIVE_RECORD_KEY)) return false
    try { localStorage.removeItem(STORAGE_KEY) } catch { return false }
    return true
  })
}

export function pauseMobileExportJob(job: MobileExportJob): Promise<boolean> {
  return saveMobileExportJob({ ...normalizeMobileExportJob(job), status: 'paused' })
}

export { STORAGE_KEY as MOBILE_EXPORT_JOB_KEY }

/** Prefer the most recent native queue copy after Android restores the WebView. */
export async function hydrateMobileExportJob(localJob: MobileExportJob | null): Promise<MobileExportJob | null> {
  await pendingMutation
  const raw = await loadMobileNativeRecord(NATIVE_RECORD_KEY)
  if (!raw) return localJob
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!validJob(parsed)) return localJob
    const nativeJob = normalizeMobileExportJob(parsed)
    if (!localJob || nativeJob.updatedAt >= localJob.updatedAt) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nativeJob))
      } catch {
        /* SQLite still remains available for the next launch. */
      }
      return nativeJob
    }
  } catch {
    /* Keep the synchronous queue when the native copy is corrupt. */
  }
  return localJob
}
