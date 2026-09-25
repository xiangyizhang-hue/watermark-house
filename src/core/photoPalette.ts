// 照片取色色卡：从照片提取主色（k-means，k=5），供 magazine 布局的取色色卡使用。
// 预览与导出共用同一算法：缩小采样 + k-means 聚类 + 按明度升序排列（深→浅，与样张一致）。
import { ref } from 'vue'

/** 采样图最长边（足够取色，开销极小） */
const SAMPLE_MAX = 64
/** k-means 迭代次数 */
const KMEANS_ITERS = 10

/** 单张照片的色卡缓存（键 = photoSrc），预览滚动/重渲染时不重复计算；上限防长会话内存膨胀 */
const cache = new Map<string, string[]>()
const CACHE_LIMIT = 30
/** 版本号：异步提取完成后自增，触发依赖刷新 */
export const paletteVersion = ref(0)

function cachePut(key: string, value: string[]): void {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  if (cache.size > CACHE_LIMIT) {
    // Map 迭代按插入序：淘汰最旧的一张
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * 从图像源提取 k 个主色（hex），按明度升序（深→浅）。
 * source：HTMLImageElement / HTMLCanvasElement 等 drawImage 可接受的图像源。
 * 提取失败（无 2d 上下文等）返回 null，调用方回退默认色。
 */
export function extractPalette(source: CanvasImageSource, width: number, height: number, k = 5): string[] | null {
  try {
    const scale = Math.min(1, SAMPLE_MAX / Math.max(width || 1, height || 1))
    const w = Math.max(1, Math.round((width || 1) * scale))
    const h = Math.max(1, Math.round((height || 1) * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(source, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h).data
    // 收集不透明像素（跳过透明/近白近黑极端噪声像素保留自然分布）
    const px: [number, number, number][] = []
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 125) continue
      px.push([data[i], data[i + 1], data[i + 2]])
    }
    if (!px.length) return null
    k = Math.max(2, Math.min(8, Math.round(k) || 5))
    // 确定性最远点初始化，避免均匀位置恰好全部命中同一种颜色。
    const centers: [number, number, number][] = []
    centers.push([...px[0]])
    for (let i = 1; i < k; i++) {
      let best = px[0], distance = -1
      for (const p of px) {
        const d = Math.min(...centers.map(c => (p[0]-c[0])**2 + (p[1]-c[1])**2 + (p[2]-c[2])**2))
        if (d > distance) { distance = d; best = p }
      }
      centers.push([...best])
    }
    const assign = new Array<number>(px.length).fill(0)
    for (let iter = 0; iter < KMEANS_ITERS; iter++) {
      for (let i = 0; i < px.length; i++) {
        let best = 0
        let bestD = Infinity
        for (let c = 0; c < centers.length; c++) {
          const dr = px[i][0] - centers[c][0]
          const dg = px[i][1] - centers[c][1]
          const db = px[i][2] - centers[c][2]
          const d = dr * dr + dg * dg + db * db
          if (d < bestD) { bestD = d; best = c }
        }
        assign[i] = best
      }
      const sum = centers.map(() => [0, 0, 0, 0])
      for (let i = 0; i < px.length; i++) {
        const a = assign[i]
        sum[a][0] += px[i][0]; sum[a][1] += px[i][1]; sum[a][2] += px[i][2]; sum[a][3]++
      }
      for (let c = 0; c < centers.length; c++) {
        if (sum[c][3] > 0) centers[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]]
      }
    }
    // 按明度升序（深→浅）
    return centers
      .slice()
      .sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]))
      .map((c) => toHex(c[0], c[1], c[2]))
  } catch {
    return null
  }
}

/** 无取色结果时不绘制色卡，绝不使用固定假色。 */
export const FALLBACK_PALETTE: string[] = []
const pending = new Map<string, Promise<string[]>>()
export const paletteErrors = new Map<string, string>()
export function paletteSize(count = 5): number { return Math.max(2, Math.min(8, Math.round(count) || 5)) }
function keyFor(src: string, count: number) { return `${count}:${src}` }

export async function detectPalette(photoSrc: string, count = 5, refresh = false): Promise<string[]> {
  count = paletteSize(count)
  const key = keyFor(photoSrc, count)
  if (pending.has(key)) return pending.get(key)!
  if (!refresh && cache.has(key)) return cache.get(key)!
  const job = (async () => {
    try {
      let colors: string[] | null = null
      const asset = photoSrc.match(/^(?:https?:\/\/asset\.localhost|asset:\/\/localhost)\/(.+)$/)
      if (asset) {
        const { readPreviewCanvas, readLocalBlob } = await import('../platform/fs')
        const path = decodeURIComponent(asset[1])
        const source = await readPreviewCanvas(path, 128)
        if (source) colors = extractPalette(source, source.width, source.height, count)
        // The native fast decoder accepts JPEG only. PNG/WebP and unusual JPEGs
        // must use a same-origin Blob, not silently stop or taint the canvas.
        if (!colors?.length) {
          const blob = await readLocalBlob(path)
          const bitmap = await createImageBitmap(blob, { resizeWidth: SAMPLE_MAX, resizeQuality: 'high' })
          try { colors = extractPalette(bitmap, bitmap.width, bitmap.height, count) }
          finally { bitmap.close() }
        }
      } else {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { img.src = ''; reject(new Error('图片读取超时')) }, 15000)
          img.onload = () => { clearTimeout(timer); resolve() }
          img.onerror = () => { clearTimeout(timer); reject(new Error('图片读取失败')) }
          img.src = photoSrc
        })
        colors = extractPalette(img, img.naturalWidth, img.naturalHeight, count)
      }
      if (!colors?.length) throw new Error('无法读取照片像素，请重新提取')
      cachePut(key, colors)
      paletteErrors.delete(key)
      return colors
    } catch (error) {
      cache.delete(key)
      paletteErrors.set(key, String(error))
      throw error
    } finally {
      pending.delete(key)
      paletteVersion.value++
    }
  })()
  pending.set(key, job)
  return job
}
export function paletteError(photoSrc: string | null, count = 5): string {
  return photoSrc ? paletteErrors.get(keyFor(photoSrc, paletteSize(count))) ?? '' : ''
}
export function paletteFor(photoSrc: string | null, count = 5): string[] {
  if (!photoSrc) return FALLBACK_PALETTE
  count = paletteSize(count)
  const key = keyFor(photoSrc, count)
  const hit = cache.get(key)
  if (hit) return hit
  if (!paletteErrors.has(key)) void detectPalette(photoSrc, count).catch(() => {})
  return FALLBACK_PALETTE
}
