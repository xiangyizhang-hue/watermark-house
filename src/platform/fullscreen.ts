import { isDesktopTauri } from './env'
let changing = false
export async function toggleFullscreen(): Promise<void> {
  if (changing) return
  changing = true
  try {
    if (isDesktopTauri) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      await win.setFullscreen(!await win.isFullscreen())
    } else if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } finally { changing = false }
}
