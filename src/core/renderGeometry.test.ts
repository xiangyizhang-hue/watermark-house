import { describe, expect, it } from 'vitest'
import { defaultFrameConfig } from './types'
import { createRenderGeometry, renderTiles, sourceRegionForTile } from './renderGeometry'
import { computeExportMetrics } from './exportMetrics'
import { applyShowToggles } from './showToggles'

describe('portable render geometry', () => {
  it.each([[6000, 4000], [4000, 6000], [4000, 4000], [10000, 1000]])('keeps existing dimensions for %dx%d', (w, h) => {
    const config = structuredClone(defaultFrameConfig)
    const plan = createRenderGeometry(w, h, config, 2)
    expect(plan.metrics).toEqual(computeExportMetrics(w, h, applyShowToggles(config), 2))
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan)
    expect(config).toEqual(defaultFrameConfig)
  })
  it('preserves explicit zero positions rather than centering them', () => {
    const config = { ...structuredClone(defaultFrameConfig), photoX: 0, photoY: 0, scale: 70 }
    expect(createRenderGeometry(6000, 4000, config).photoContent).toEqual({ x: 0, y: 0 })
  })
  it.each([NaN, Infinity, 0, -1])('rejects invalid input %s before allocation', value => {
    expect(() => createRenderGeometry(value, 4000, defaultFrameConfig)).toThrow()
    expect(() => createRenderGeometry(6000, 4000, defaultFrameConfig, value)).toThrow()
  })
  it('covers output exactly once with clipped effect overlap', () => {
    const width = 31, height = 19
    const counts = new Uint8Array(width * height)
    for (const { output, work, crop } of renderTiles(width, height, 8, 6, 4)) {
      expect(work.x + crop.x).toBe(output.x)
      expect(work.y + crop.y).toBe(output.y)
      expect(work.x + work.width).toBeLessThanOrEqual(width)
      expect(work.y + work.height).toBeLessThanOrEqual(height)
      expect(crop.x + crop.width).toBeLessThanOrEqual(work.width)
      expect(crop.y + crop.height).toBeLessThanOrEqual(work.height)
      for (let y = output.y; y < output.y + output.height; y++)
        for (let x = output.x; x < output.x + output.width; x++) counts[y * width + x]++
    }
    expect([...counts].every(count => count === 1)).toBe(true)
  })
  it('plans a 100MP image lazily without allocating its pixel buffer', () => {
    const tiles = renderTiles(10000, 10000)
    expect(tiles.next().value?.output).toEqual({ x: 0, y: 0, width: 1024, height: 256 })
    expect(tiles.next().value?.output.x).toBe(1024)
  })
  it.each([0, 90, 180, 270, 37])('maps rotated source center consistently at %d degrees', rotation => {
    const config = { ...structuredClone(defaultFrameConfig), photoRotation: rotation, photoCrop: { x: 0, y: 0, w: 1, h: 1 } }
    const plan = createRenderGeometry(6000, 4000, config)
    const [a, b, c, d, e, f] = plan.sourceToOutput
    const m = plan.metrics
    expect(a * 3000 + c * 2000 + e).toBeCloseTo((m.effectivePad + m.bgExpand + plan.photoContent.x) * m.unitScale + m.photoW / 2)
    expect(b * 3000 + d * 2000 + f).toBeCloseTo((m.effectivePad + m.bgExpand + plan.photoContent.y) * m.unitScale + m.photoH / 2)
  })
  it('decodes only the source region required by the work tile', () => {
    const plan = createRenderGeometry(6000, 4000, { ...structuredClone(defaultFrameConfig), showBorder: false, scale: 100,
      photoX: 0, photoY: 0, frameRatio: null, photoRotation: 0, photoCrop: { x: 0, y: 0, w: 1, h: 1 } })
    expect(sourceRegionForTile(plan, { x: 100, y: 200, width: 1024, height: 256 })).toEqual({ x: 98, y: 198, width: 1028, height: 260 })
    expect(sourceRegionForTile(plan, { x: 7000, y: 200, width: 100, height: 100 })).toBeNull()
    expect(sourceRegionForTile(plan, { x: 0, y: 0, width: 10, height: 10 })).toEqual({ x: 0, y: 0, width: 12, height: 12 })
  })
})
