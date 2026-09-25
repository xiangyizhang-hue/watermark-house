import type { FrameConfig } from './types'
import { computeExportMetrics, type ExportMetrics } from './exportMetrics'
import { applyShowToggles } from './showToggles'
import { rotatedSize } from './photoEdit'

/** Canvas affine convention: x'=a*x+c*y+e; y'=b*x+d*y+f. */
export type RenderMatrix = [number, number, number, number, number, number]

/** Geometry portion of the portable render contract. Layers are not encoded here. */
export interface RenderGeometry {
  version: 1
  source: { width: number; height: number }
  metrics: ExportMetrics
  photoContent: { x: number; y: number }
  /** Original decoded pixels to global output pixels (before photo clipping). */
  sourceToOutput: RenderMatrix
}

export function createRenderGeometry(
  width: number, height: number, config: FrameConfig, scale = 1,
): RenderGeometry {
  if (![width, height, scale].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('源图尺寸或导出倍率无效')
  }
  const effective = applyShowToggles(config)
  const metrics = computeExportMetrics(width, height, effective, scale)
  if (Object.values(metrics).some(value => !Number.isFinite(value)) || metrics.canvasW < 1 || metrics.canvasH < 1) {
    throw new Error('导出画面参数无效，请检查裁剪、缩放与留白')
  }
  const x = effective.photoX ?? (metrics.availW - metrics.photoDesignW) / 2
  const y = effective.photoY ?? (effective.frameRatio ? (metrics.designContentH - metrics.photoDesignH) / 2 : 0)
  if (![x, y].every(Number.isFinite)) throw new Error('照片位置参数无效')
  const rotated = rotatedSize(width, height, effective.photoRotation)
  const crop = effective.photoCrop
  if (![crop.x, crop.y, crop.w, crop.h].every(Number.isFinite) || crop.w <= 0 || crop.h <= 0) {
    throw new Error('裁剪区域无效')
  }
  const ratio = metrics.photoW / (crop.w * rotated.w)
  const angle = effective.photoRotation * Math.PI / 180
  const a = ratio * Math.cos(angle), b = ratio * Math.sin(angle)
  const c = -b || 0, d = a
  const centerX = (crop.x + crop.w / 2 - 0.5) * rotated.w
  const centerY = (crop.y + crop.h / 2 - 0.5) * rotated.h
  const originX = (metrics.effectivePad + metrics.bgExpand + x) * metrics.unitScale
  const originY = (metrics.effectivePad + metrics.bgExpand + y) * metrics.unitScale
  const sourceToOutput: RenderMatrix = [a, b, c, d,
    originX + metrics.photoW / 2 - ratio * centerX - a * width / 2 - c * height / 2,
    originY + metrics.photoH / 2 - ratio * centerY - b * width / 2 - d * height / 2]
  return { version: 1, source: { width, height }, metrics, photoContent: { x, y }, sourceToOutput }
}

/** Conservative original decode rectangle for one output work tile. Null is fully outside. */
export function sourceRegionForTile(geometry: RenderGeometry, tile: RenderTile['work'], samplingMargin = 2): RenderTile['output'] | null {
  if (!Number.isSafeInteger(samplingMargin) || samplingMargin < 0 ||
      ![tile.x, tile.y, tile.width, tile.height].every(Number.isFinite) || tile.width <= 0 || tile.height <= 0) {
    throw new Error('无效的解码区域')
  }
  const [a, b, c, d, e, f] = geometry.sourceToOutput
  const determinant = a * d - b * c
  if (!Number.isFinite(determinant) || determinant === 0) throw new Error('不可逆的照片变换')
  const points = [
    [tile.x, tile.y], [tile.x + tile.width, tile.y],
    [tile.x, tile.y + tile.height], [tile.x + tile.width, tile.y + tile.height],
  ].map(([x, y]) => ({ x: (d * (x - e) - c * (y - f)) / determinant,
    y: (-b * (x - e) + a * (y - f)) / determinant }))
  const left = Math.max(0, Math.floor(Math.min(...points.map(p => p.x))) - samplingMargin)
  const top = Math.max(0, Math.floor(Math.min(...points.map(p => p.y))) - samplingMargin)
  const right = Math.min(geometry.source.width, Math.ceil(Math.max(...points.map(p => p.x))) + samplingMargin)
  const bottom = Math.min(geometry.source.height, Math.ceil(Math.max(...points.map(p => p.y))) + samplingMargin)
  return right <= left || bottom <= top ? null : { x: left, y: top, width: right - left, height: bottom - top }
}

export interface RenderTile {
  /** Final output rectangle, in global output pixels. */
  output: { x: number; y: number; width: number; height: number }
  /** Expanded work rectangle, clipped to output bounds, for blur/shadow overlap. */
  work: { x: number; y: number; width: number; height: number }
  /** Crop inside work to write exactly once; overlap is never written twice. */
  crop: { x: number; y: number; width: number; height: number }
}

/** Lazy scanline order; native encoding can release each strip after writing it. */
export function* renderTiles(width: number, height: number, tileWidth = 1024, tileHeight = 256, overlap = 0): Generator<RenderTile> {
  if (![width, height, tileWidth, tileHeight].every(value => Number.isSafeInteger(value) && value > 0) ||
      !Number.isSafeInteger(overlap) || overlap < 0) throw new Error('无效的分块尺寸')
  for (let y = 0; y < height; y += tileHeight) {
    for (let x = 0; x < width; x += tileWidth) {
      const output = { x, y, width: Math.min(tileWidth, width - x), height: Math.min(tileHeight, height - y) }
      const left = Math.max(0, x - overlap), top = Math.max(0, y - overlap)
      const work = { x: left, y: top,
        width: Math.min(width, x + output.width + overlap) - left,
        height: Math.min(height, y + output.height + overlap) - top }
      yield { output, work, crop: { x: x - left, y: y - top, width: output.width, height: output.height } }
    }
  }
}
