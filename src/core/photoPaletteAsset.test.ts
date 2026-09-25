import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../platform/fs', () => ({ readPreviewCanvas: vi.fn(), readLocalBlob: vi.fn() }))
import { readPreviewCanvas, readLocalBlob } from '../platform/fs'
import { detectPalette, paletteError, paletteFor } from './photoPalette'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('local palette decoding', () => {
  it.each(['png','webp','jpg'])('falls back for %s when the JPEG decoder cannot read it', async ext => {
    vi.mocked(readPreviewCanvas).mockResolvedValue(null)
    vi.mocked(readLocalBlob).mockResolvedValue(new Blob(['fixture']))
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({width:64,height:32,close}))
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({
      drawImage:vi.fn(), getImageData:()=>({data:new Uint8ClampedArray([255,0,0,255,0,0,255,255])}),
    } as unknown as CanvasRenderingContext2D)
    const src = `http://asset.localhost/${encodeURIComponent(`/private/照片.${ext}`)}`
    const colors = await detectPalette(src,2,true)
    expect(colors).toEqual(['#0000ff','#ff0000'])
    expect(readLocalBlob).toHaveBeenCalledWith(`/private/照片.${ext}`)
    expect(close).toHaveBeenCalledOnce()
    expect(paletteFor(src,2)).toEqual(colors)
  })
  it('retries a failed local image without keeping fake colors or stale errors', async () => {
    const src = 'http://asset.localhost/retry.png'
    vi.mocked(readPreviewCanvas).mockResolvedValue(null)
    vi.mocked(readLocalBlob).mockRejectedValueOnce(new Error('unavailable'))
    await expect(detectPalette(src,3)).rejects.toThrow('unavailable')
    expect(paletteError(src,3)).toContain('unavailable')
    expect(paletteFor(src,3)).toEqual([])
    vi.mocked(readLocalBlob).mockResolvedValue(new Blob())
    vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({width:64,height:64,close:vi.fn()}))
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({
      drawImage:vi.fn(),getImageData:()=>({data:new Uint8ClampedArray([20,50,80,255])}),
    } as unknown as CanvasRenderingContext2D)
    expect(await detectPalette(src,3,true)).toHaveLength(3)
    expect(paletteError(src,3)).toBe('')
  })
})
