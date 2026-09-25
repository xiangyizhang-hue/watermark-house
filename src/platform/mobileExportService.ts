/**
 * Android foreground lifetime for a FrameLab export job.
 *
 * The actual render plan remains shared with the desktop/WebView exporter. These
 * calls only manage the native foreground notification and the cancellation flag,
 * so the same queue can be resumed after a process restart without duplicating
 * layout logic in Kotlin.
 */
import { isAndroid, isTauri } from './env'

export interface MobileExportServiceProgress {
  jobId: string
  total: number
  completed: number
  label: string
}

async function nativeInvoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

function canUseNativeService(): boolean {
  return isAndroid && isTauri
}

export async function startMobileExportService(progress: MobileExportServiceProgress): Promise<boolean> {
  if (!canUseNativeService()) return false
  try {
    await nativeInvoke('mobile_start_export_service', {
      jobId: progress.jobId,
      total: Math.max(0, progress.total),
      completed: Math.max(0, progress.completed),
      label: progress.label,
    })
    return true
  } catch {
    // The queue can still run in the foreground if the device rejects FGS start.
    return false
  }
}

export async function updateMobileExportService(progress: MobileExportServiceProgress): Promise<boolean> {
  if (!canUseNativeService()) return false
  try {
    await nativeInvoke('mobile_update_export_service', {
      jobId: progress.jobId,
      total: Math.max(0, progress.total),
      completed: Math.max(0, progress.completed),
      label: progress.label,
    })
    return true
  } catch {
    return false
  }
}

export async function requestMobileExportCancel(jobId: string): Promise<boolean> {
  if (!canUseNativeService()) return false
  try {
    await nativeInvoke('mobile_cancel_export_service', { jobId })
    return true
  } catch {
    return false
  }
}

export async function isMobileExportCancelled(jobId: string): Promise<boolean> {
  if (!canUseNativeService()) return false
  try {
    return await nativeInvoke<boolean>('mobile_is_export_cancelled', { jobId })
  } catch {
    return false
  }
}

export async function stopMobileExportService(jobId: string): Promise<boolean> {
  if (!canUseNativeService()) return false
  try {
    await nativeInvoke('mobile_stop_export_service', { jobId })
    return true
  } catch {
    return false
  }
}
