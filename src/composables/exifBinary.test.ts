import { describe, expect, it } from 'vitest'
import { parseExif } from './useExif'

describe('binary metadata import', () => {
  it('reads camera data from a TIFF buffer without an image replacement', async () => {
    const bytes = new Uint8Array(64)
    const view = new DataView(bytes.buffer)
    bytes.set([73,73,42,0,8,0,0,0])
    view.setUint16(8, 2, true)
    view.setUint16(10, 271, true); view.setUint16(12, 2, true)
    view.setUint32(14, 6, true); view.setUint32(18, 38, true)
    view.setUint16(22, 272, true); view.setUint16(24, 2, true)
    view.setUint32(26, 10, true); view.setUint32(30, 44, true)
    bytes.set(new TextEncoder().encode('NIKON\0'), 38)
    bytes.set(new TextEncoder().encode('NIKON Z 6\0'), 44)
    const result = await parseExif(bytes.buffer)
    expect(result.make).toBe('NIKON')
    expect(result.model).toBe('Z 6')
  })
  it('rejects invalid files instead of returning blank metadata', async () => {
    await expect(parseExif(new Uint8Array([0,1,2,3]).buffer)).rejects.toThrow()
  })
})
