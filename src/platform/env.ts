// 平台环境判断。
//
// 重要：Tauri Android 也会注入 __TAURI_INTERNALS__，因此 isTauri 不能再被
// 当作「Windows 桌面端」使用。桌面菜单、文件夹扫描、GPU、资源管理器和
// updater 等能力统一使用 isDesktopTauri；移动端走自己的导入/导出入口。
const hasTauriRuntime =
  typeof window !== 'undefined' &&
  ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)

const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
const mobileUserAgent = /Android|iPhone|iPad|iPod|Windows Phone/i.test(userAgent)
// 少数厂商 WebView 会裁剪 UA 中的 Android 片段；Linux UA + 触屏是一个
// 更稳妥的 Android 兜底，避免误走桌面初始化（其原生命令在 Android 不存在）。
const androidLikeUserAgent =
  /Android/i.test(userAgent) ||
  (/Linux/i.test(userAgent) &&
    typeof navigator !== 'undefined' &&
    navigator.maxTouchPoints > 0)

/** 当前 WebView 是否由 Tauri 承载（桌面和 Android 都是 true）。 */
export const isTauri: boolean = hasTauriRuntime

/** Android 运行环境。Android Tauri 的 UA 保留 Android 标识，浏览器测试可用 ?mobile=1。 */
export const isAndroid: boolean =
  androidLikeUserAgent ||
  (typeof location !== 'undefined' && new URLSearchParams(location.search).get('mobile') === '1')

/** 触屏移动环境（为后续 iOS 移植保留，不把窄窗口桌面误判成手机）。 */
export const isMobile: boolean = isAndroid || mobileUserAgent

/** 只有传统桌面 Tauri 才能使用 Windows 原生能力。 */
export const isDesktopTauri: boolean = isTauri && !isMobile

/** 用于独立的移动布局测试：真机按 UA 命中，桌面浏览器可用窄视口或 ?mobile=1。 */
export const isMobileViewport: boolean =
  isMobile ||
  (typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 720px)').matches)
