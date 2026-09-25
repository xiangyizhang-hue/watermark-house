import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../composables/useLogoStore', () => ({ preloadBrandLogo: vi.fn(), resolveLogo: vi.fn() }))
vi.mock('../composables/useModelMarkStore', () => ({ preloadModelMark: vi.fn(), resolveModelMark: vi.fn() }))
vi.mock('./watermarkFonts', () => ({ loadWatermarkFonts: vi.fn() }))
import { recordExportPlan } from './exporter'
import { defaultFrameConfig } from './types'
import { createWatermark } from './creativeWatermark'

describe('existing exporter to portable plan integration', () => {
  afterEach(() => vi.restoreAllMocks())
  it('records original watermark text and exactly two rules without allocating a photo canvas', async () => {
    const pixels: number[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function(this: HTMLCanvasElement) {
      pixels.push(this.width * this.height)
      return { save: vi.fn(), restore: vi.fn(), font: '10px sans-serif',
        measureText: (text: string) => ({ width: text.length * 8 }) } as unknown as CanvasRenderingContext2D
    })
    const source = document.createElement('canvas')
    source.width = 6000
    source.height = 4000
    const config = { ...structuredClone(defaultFrameConfig), photoSrc: '', showInfo: false,
      showBackground: false, grain: 0, vignette: 0, creativeWatermark: createWatermark(0) }
    const plan = await recordExportPlan(source, config, () => ({ uri: '/private/originals/photo.jpg', width: 6000, height: 4000 }))
    const root = plan.surfaces.find(surface => surface.id === plan.root)!
    expect(root.width).toBe(6000)
    expect(root.height).toBe(4000)
    expect(root.commands.filter(command => command.op === 'stroke')).toHaveLength(2)
    expect(root.commands.some(command => command.op === 'fillText')).toBe(true)
    expect(plan.images).toHaveLength(1)
    expect(pixels.length).toBeGreaterThan(0)
    expect(pixels.every(area => area === 1)).toBe(true)
  })
  it('records blur, dither, grain and vignette with bounded raster tiles and correct background origin', async () => {
    const areas: number[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function(this: HTMLCanvasElement) {
      areas.push(this.width * this.height)
      return { save: vi.fn(), restore: vi.fn(), font: '10px sans-serif',
        measureText: () => ({ width: 8 }),
        createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D
    })
    const source = document.createElement('canvas')
    source.width = 6000
    source.height = 4000
    const config = { ...structuredClone(defaultFrameConfig), photoSrc: '', showInfo: false,
      showBorder: true, padding: 30, showBackground: true, bgMode: 'blur' as const,
      grain: 0.5, vignette: 0.5, blur: 10 }
    const plan = await recordExportPlan(source, config, image => {
      const canvas = image as HTMLCanvasElement
      return { uri: image === source ? '/private/photo.jpg' : `/private/tile-${canvas.width}.png`, width: canvas.width, height: canvas.height }
    })
    expect(areas.every(area => area <= 1024 * 1024)).toBe(true)
    const root = plan.surfaces.find(surface => surface.id === plan.root)!
    expect(root.commands).toContainEqual({ op: 'translate', args: [150, 150] })
    const commands = plan.surfaces.flatMap(surface => surface.commands)
    expect(commands.filter(command => command.op === 'createPattern')).toHaveLength(2)
    expect(commands.some(command => command.op === 'createRadialGradient')).toBe(true)
    expect(commands.some(command => command.op === 'set' && command.args[0] === 'filter')).toBe(true)
    expect(plan.images.map(image => image.width).sort((a, b) => a - b)).toEqual([128, 1024, 6000])
  })
})
