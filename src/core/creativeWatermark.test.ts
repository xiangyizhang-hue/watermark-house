import { describe, it, expect, vi } from 'vitest'
import { createWatermark, drawCreativeWatermark } from './creativeWatermark'
describe('creative watermark', () => {
  it('reference has exactly one top and one bottom rule', () => {
    const rules = createWatermark().elements.filter(e => e.kind === 'line')
    expect(rules).toHaveLength(2)
    expect(rules[0]!.y).toBeLessThan(10)
    expect(rules[1]!.y).toBeGreaterThan(90)
  })
  it.each([[1080,720],[720,1080],[1000,1000],[2400,600],[600,2400]])('all four designs draw inside %s × %s', (w,h) => {
    for (let style = 0; style < 4; style++) {
      const ctx = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillText: vi.fn(), measureText: () => ({width:10}) }
      drawCreativeWatermark(ctx as unknown as CanvasRenderingContext2D,w,h,createWatermark(style))
      for (const [x,y] of ctx.translate.mock.calls as unknown as number[][]) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(w); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(h) }
      expect(ctx.stroke.mock.calls.length).toBeLessThanOrEqual(2)
    }
  })
  it('disabled watermark does not draw', () => {
    const ctx = {save: vi.fn()}
    drawCreativeWatermark(ctx as unknown as CanvasRenderingContext2D,100,100,{...createWatermark(),enabled:false})
    expect(ctx.save).not.toHaveBeenCalled()
  })
})
