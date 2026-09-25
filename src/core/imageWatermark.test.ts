import { describe, expect, it, vi } from 'vitest'
import { drawWatermark } from './bgRenderer'
import { defaultFrameConfig } from './types'
import { pickModules } from './configModules'

describe('image watermark layout and reusable configuration', () => {
  it('keeps rotated image bounds on the canvas when edge aligned', () => {
    const ctx = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() }
    const image = document.createElement('canvas'); image.width = 200; image.height = 100
    drawWatermark(ctx as unknown as CanvasRenderingContext2D, 1000, 500, {
      text:'', image, opacity:0.6, size:20, angle:90, tile:false,
      align:'center', bottom:40, position:{x:100,y:0},
    })
    expect(ctx.translate.mock.calls[0][0]).toBeCloseTo(950)
    expect(ctx.translate.mock.calls[0][1]).toBeCloseTo(100)
    expect(ctx.drawImage).toHaveBeenCalledOnce()
  })
  it('includes original image, tint and normalized position in module copies', () => {
    const config = { ...defaultFrameConfig, watermarkImage:'data:image/png;base64,test',
      watermarkTint:'#abcdef', watermarkPosition:{x:25,y:80} }
    const restored = JSON.parse(JSON.stringify(pickModules(config, ['effects'])))
    expect(restored.watermarkImage).toBe(config.watermarkImage)
    expect(restored.watermarkTint).toBe('#abcdef')
    expect(restored.watermarkPosition).toEqual({x:25,y:80})
  })
  it('leaves legacy single watermark placement unchanged', () => {
    const ctx = { save: vi.fn(), restore: vi.fn(), drawImage: vi.fn() }
    const image = document.createElement('canvas'); image.width = 200; image.height = 100
    drawWatermark(ctx as unknown as CanvasRenderingContext2D, 1000, 500, {
      text:'', image, opacity:1, size:20, angle:30, tile:false, align:'center', bottom:40,
    })
    expect(ctx.drawImage).toHaveBeenCalledWith(image,400,410,200,100)
  })
})
