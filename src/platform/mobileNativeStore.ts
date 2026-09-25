import { isAndroid, isTauri } from './env'

/** SQLite-backed records available on Android; browser/desktop calls are no-ops. */
function nativeStoreAvailable(): boolean {
  return isAndroid && isTauri
}

async function nativeInvoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export async function saveMobileNativeRecord(key: string, value: string, version = 1): Promise<boolean> {
  if (!nativeStoreAvailable()) return false
  try {
    await nativeInvoke('mobile_save_local_record', { key, value, version })
    return true
  } catch {
    return false
  }
}

export async function loadMobileNativeRecord(key: string): Promise<string | null> {
  if (!nativeStoreAvailable()) return null
  try {
    return await nativeInvoke<string | null>('mobile_load_local_record', { key })
  } catch {
    return null
  }
}

export async function deleteMobileNativeRecord(key: string): Promise<boolean> {
  if (!nativeStoreAvailable()) return false
  try {
    await nativeInvoke('mobile_delete_local_record', { key })
    return true
  } catch {
    return false
  }
}
