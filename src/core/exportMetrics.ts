// Shared geometry: no image decoding, canvas allocation, or DOM access.
import type { FrameConfig } from './types'
import { DESIGN_CONTAINER } from './constants'
import { rotatedSize } from './photoEdit'

// ===== 导出画布度量（纯计算，无 DOM）：导出与任务卡预估共用同一公式 =====
export interface ExportMetrics {
  canvasW: number
  canvasH: number
  designCanvasH: number
  unitScale: number
  photoW: number
  photoH: number
  displayW: number
  displayH: number
  photoDesignW: number
  photoDesignH: number
  designContentH: number
  availW: number
  bgExpand: number
  bgBottomExpand: number
  effectivePad: number
  effectivePadBottom: number
}

/** 依据源图尺寸与配置计算导出画布全部度量（exportFrame 内部与预估同源） */
export function computeExportMetrics(
  srcW: number,
  srcH: number,
  config: FrameConfig,
  supersample: number,
): ExportMetrics {
  const ss = supersample > 0 ? supersample : 1
  const effectivePad = config.padding
  const effectivePadBottom = config.padding + config.borderRatio
  const availW = DESIGN_CONTAINER
  const bgExpand = config.bgExpand || 0
  const bgBottomExpand = bgExpand + (config.bgBottomRatio || 0)

  // 旋转+裁剪后的"显示像素"尺寸（最终照片真实像素）
  const rSize = rotatedSize(srcW, srcH, config.photoRotation)
  const displayW = Math.max(1, rSize.w * config.photoCrop.w)
  const displayH = Math.max(1, rSize.h * config.photoCrop.h)
  const displayAspect = displayW / displayH

  // 画面（边框）比例：整体画布宽高比。null = 自由（跟随照片）。
  // 比例模式反推设计内容高，使「最终整体画布」（含背景扩展 + 边框 padding）宽高比 = frameRatio。
  const frameRatio = config.frameRatio
  let designContentH = 0
  let photoBaseW = DESIGN_CONTAINER
  if (frameRatio) {
    const canvasWD = DESIGN_CONTAINER + 2 * bgExpand + 2 * effectivePad
    const padsV = bgExpand + bgBottomExpand + effectivePad + effectivePadBottom
    designContentH = Math.max(0, canvasWD / frameRatio - padsV)
    // 审查报告 R12：比例极宽 + 大留白时内容高可归 0 → 后续会退化为 1px 内容宽并抛出
    // 「请降低 scale」的误导文案；此处给出准确原因
    if (designContentH < 1) {
      throw new Error('画面比例与边框留白冲突：请减小边框宽度 / 背景扩展，或改用更方的画面比例')
    }
    const contentAspect = DESIGN_CONTAINER / Math.max(1, designContentH)
    photoBaseW = displayAspect >= contentAspect ? DESIGN_CONTAINER : designContentH * displayAspect
  }

  const photoDesignW = Math.max(1, photoBaseW * (config.scale / 100))
  const photoDesignH = photoDesignW / displayAspect
  if (!frameRatio) designContentH = photoDesignH

  // unitScale：把设计坐标（1200 宽）映射到像素；照片以原生裁剪像素 1:1 进入
  const unitScale = (displayW / photoDesignW) * ss
  const canvasW = Math.round((DESIGN_CONTAINER + 2 * bgExpand + 2 * effectivePad) * unitScale)
  // 比例模式始终按设计内容高定画布高（保证整体比例 = frameRatio）；自由模式才允许 canvasH 覆盖。
  const designCanvasH =
    (frameRatio
      ? designContentH + effectivePad + effectivePadBottom
      : config.canvasH || designContentH + effectivePad + effectivePadBottom) + bgExpand + bgBottomExpand
  const canvasH = Math.round(designCanvasH * unitScale)
  const photoW = Math.round(displayW * ss)
  const photoH = Math.round(displayH * ss)
  return {
    canvasW, canvasH, designCanvasH, unitScale, photoW, photoH,
    displayW, displayH, photoDesignW, photoDesignH, designContentH,
    availW, bgExpand, bgBottomExpand, effectivePad, effectivePadBottom,
  }
}

/** 任务卡预估：只关心输出像素尺寸 */
export function estimateExportSize(
  srcW: number,
  srcH: number,
  config: FrameConfig,
  supersample: number,
): { w: number; h: number } {
  const m = computeExportMetrics(srcW, srcH, config, supersample)
  return { w: m.canvasW, h: m.canvasH }
}
