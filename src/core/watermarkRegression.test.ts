import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWatermark, normalizeWatermark, updateWatermark, watermarkAlignment, drawCreativeWatermark } from './creativeWatermark'
import { useFrameConfig } from '../composables/useFrameConfig'
import { applyTemplateToState, sanitizeTemplateConfig, useTemplates } from '../composables/useTemplates'

beforeEach(() => useFrameConfig().loadConfig({}))
describe('watermark fixes', () => {
  it('saved templates remain independent and apply identically on another photo', () => {
    const { state, patch, loadConfig } = useFrameConfig()
    patch({ photoSrc: 'photo-a', creativeWatermark: createWatermark(), showBorder: false })
    const saved = useTemplates().toTemplateConfig(state)
    state.creativeWatermark!.elements[0]!.text = 'changed after saving'
    expect(saved.creativeWatermark!.elements[0]!.text).toBe('YOUR STUDIO · PHOTOGRAPHY')
    loadConfig({ photoSrc: 'photo-b', showBorder: true })
    applyTemplateToState(JSON.parse(JSON.stringify(saved)))
    expect(state.photoSrc).toBe('photo-b')
    expect(state.creativeWatermark).toEqual(saved.creativeWatermark)
    expect(state.showBorder).toBe(false)
    state.creativeWatermark!.elements[0]!.size = 90
    expect(saved.creativeWatermark!.elements[0]!.size).toBe(14)
  })
  it('reset retains photo but removes all decoration; fresh load does not inherit edits', () => {
    const { state, patch, reset, loadConfig } = useFrameConfig()
    patch({ photoSrc: 'photo-a', padding: 60, shadow: 1, frameRatio: 1.5, creativeWatermark: createWatermark(), showWatermark: true })
    reset()
    expect(state.photoSrc).toBe('photo-a')
    expect(state.padding).toBe(0)
    expect(state.shadow).toBe(0)
    expect(state.frameRatio).toBeNull()
    expect(state.creativeWatermark).toBeUndefined()
    expect(state.showWatermark).toBe(false)
    patch({ creativeWatermark: createWatermark(), padding: 60 })
    loadConfig({ photoSrc: 'photo-b' })
    expect(state.padding).toBe(0)
    expect(state.creativeWatermark).toBeUndefined()
  })
  it('links brand text and styling in either direction with mirrored height', () => {
    let config = updateWatermark(createWatermark(), 0, { text: '工作室', y: 4, size: 20, x: 95, align: 'right' })
    expect(config.elements[5]).toMatchObject({ text: '工作室', y: 96, size: 20, x: 95, align: 'right' })
    config = updateWatermark(config, 5, { y: 97, font: 'serif', opacity: .5 })
    expect(config.elements[0]).toMatchObject({ y: 3, font: 'serif', opacity: .5 })
    config.linkBrands = false
    config = updateWatermark(config, 0, { text: 'independent' })
    expect(config.elements[5]!.text).toBe('工作室')
  })
  it('rejects malformed saved data and clamps invalid geometry', () => {
    expect(normalizeWatermark({ elements: null })).toBeUndefined()
    const raw = createWatermark()
    raw.elements[0]!.x = 200
    raw.elements[0]!.opacity = NaN
    const clean = sanitizeTemplateConfig({ creativeWatermark: raw }).creativeWatermark!
    expect(clean.elements[0]!.x).toBe(100)
    expect(Number.isFinite(clean.elements[0]!.opacity)).toBe(true)
    expect(raw.elements[0]!.x).toBe(200)
  })
  it.each([[1080,720],[720,1080],[1000,1000],[2400,600],[600,2400]])('snaps all presets to actual edges at %s × %s', (w,h) => {
    for (let style=0; style<4; style++) for (const align of ['left','center','right'] as const) {
      const config = updateWatermark(createWatermark(style), 0, watermarkAlignment(align))
      const ctx = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillText: vi.fn(), measureText: () => ({ width: 10 }) }
      drawCreativeWatermark(ctx as unknown as CanvasRenderingContext2D,w,h,config)
      expect(ctx.translate.mock.calls[0]![0]).toBe(align === 'left' ? w*5/100 : align === 'right' ? w*95/100 : w/2)
      const firstX = ctx.fillText.mock.calls[0]![1]
      expect(align === 'left' ? firstX === 0 : firstX < 0).toBe(true)
    }
  })
})
