// Android 成品保存适配层。
//
// 当前没有生成的 Android/Kotlin 工程时，使用浏览器下载作为可用兜底；
// 工程接入后优先调用分块 MediaStore 写入，把文件写入系统相册的
// Pictures/FrameLab 相册。调用方只关心 result.mode，不与 Android API 耦合。
import { downloadBlob } from '../core/exporter'
import { isMobile, isTauri } from './env'

export interface MobileSaveResult {
  mode: 'native' | 'download'
  /** 原生相册返回的媒体标识或路径；下载兜底为空。 */
  location: string | null
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('读取导出文件失败'))
    reader.readAsDataURL(blob)
  })
}

async function saveMobileBlobStream(blob: Blob, filename: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core')
  const token = await invoke<string>('mobile_begin_media', {
    filename,
    mime: blob.type || 'image/jpeg',
  })
  let finished = false
  try {
    // Read one slice at a time. A 2MB chunk keeps the IPC/base64 peak bounded even
    // when the final image is hundreds of megabytes.
    const chunkSize = 2 * 1024 * 1024
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      const chunk = blob.slice(offset, Math.min(offset + chunkSize, blob.size))
      await invoke('mobile_write_media_chunk', {
        token,
        dataBase64: await blobToBase64(chunk),
      })
    }
    const location = await invoke<string>('mobile_finish_media', { token })
    finished = true
    return location
  } finally {
    if (!finished) {
      await invoke('mobile_abort_media', { token }).catch(() => {})
    }
  }
}

/**
 * 保存到 Android 相册；原生写入失败必须上报，不能伪装成浏览器下载成功。
 * Android 使用分块写入，不把整张高分辨率成品物化为一个 base64 字符串。
 */
export async function saveMobileBlob(blob: Blob, filename: string): Promise<MobileSaveResult> {
  if (!isMobile) {
    downloadBlob(blob, filename)
    return { mode: 'download', location: null }
  }

  if (isTauri) {
    const location = await saveMobileBlobStream(blob, filename)
    if (!location) throw new Error('相册写入没有返回文件位置，导出尚未确认成功')
    return { mode: 'native', location }
  }

  downloadBlob(blob, filename)
  return { mode: 'download', location: null }
}
