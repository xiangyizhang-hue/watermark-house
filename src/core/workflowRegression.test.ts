import { describe, expect, it } from 'vitest'
import { defaultFrameConfig } from './types'
import { photoIdentity } from './photoIdentity'
import { pickModules, mergeModuleConfig } from './configModules'
import { createWatermark, switchWatermarkStyle, updateWatermark, normalizeWatermark, watermarkAlignment } from './creativeWatermark'
import { sanitizeTemplateConfig } from '../composables/useTemplates'
describe('0.3.0 workflows', () => {
  it('uses stable complete Windows paths, not changing random IDs or basenames', () => {
    expect(photoIdentity('E:\\Photos\\A.JPG')).toBe(photoIdentity('e:/photos/a.jpg'))
    expect(photoIdentity('e:/other/a.jpg')).not.toBe(photoIdentity('e:/photos/a.jpg'))
  })
  it('creative-only copy leaves all other target modules and photo intact', () => {
    const source = {...defaultFrameConfig, photoSrc: 'a', padding: 80, creativeWatermark: createWatermark()}
    const target = {...defaultFrameConfig, photoSrc: 'b', padding: 12, bgColor: '#112233', cameraModel: 'TARGET'}
    const copied = pickModules(source,['creative'])
    expect(Object.keys(copied)).toEqual(['creativeWatermark'])
    const next = mergeModuleConfig(target, copied)
    expect(next).toMatchObject({photoSrc:'b',padding:12,bgColor:'#112233',cameraModel:'TARGET'})
    next.creativeWatermark!.elements[0]!.text = 'changed'
    expect(source.creativeWatermark.elements[0]!.text).not.toBe('changed')
  })
  it('copies disabled watermark explicitly and preserves numeric nullable fields', () => {
    expect(pickModules(defaultFrameConfig,['creative']).creativeWatermark?.enabled).toBe(false)
    const source={...defaultFrameConfig, photoX:42, photoY:36, cameraModelColor:'#ffffff'}
    const copied = sanitizeTemplateConfig(pickModules(source,['photo']))
    expect(copied.photoX).toBe(42)
    expect(copied.photoY).toBe(36)
    expect(copied.cameraModelColor).toBeUndefined()
  })
  it('copies validated INFO metadata without replacing the target photo', () => {
    const source = {...defaultFrameConfig, exifRaw: {iso:100, model:'NIKON', focalLength:85}, cameraModel:'NIKON', photoSrc:'original.nef'}
    const payload = sanitizeTemplateConfig(JSON.parse(JSON.stringify(pickModules(source, ['info']))))
    const result = mergeModuleConfig({...defaultFrameConfig, photoSrc:'edited.jpg'}, payload)
    expect(result.exifRaw).toEqual(source.exifRaw)
    expect(result.photoSrc).toBe('edited.jpg')
    expect(result.cameraModel).toBe('NIKON')
  })
  it('round-trips text through styles that temporarily hide brand fields', () => {
    let config = updateWatermark(createWatermark(),0,{text:'我的品牌'})
    config = updateWatermark(config,2,{text:'作品名'})
    config = switchWatermarkStyle(config,2)
    config = normalizeWatermark(JSON.parse(JSON.stringify(config)))!
    config = switchWatermarkStyle(config,3)
    config = switchWatermarkStyle(config,1)
    expect(config.elements.find(e => e.id === '顶部品牌')!.text).toBe('我的品牌')
    expect(config.elements.find(e => e.id === '作品标题')!.text).toBe('作品名')
    expect(config.elements[0]!.x).toBe(5)
  })
  it('alignment is repeatable, keeps a margin and allows explicit edge snapping', () => {
    expect(watermarkAlignment('left')).toMatchObject({x:5})
    expect(watermarkAlignment('right')).toMatchObject({x:95})
    expect(watermarkAlignment('right',8)).toMatchObject({x:92})
    expect(watermarkAlignment('right',0)).toMatchObject({x:100})
  })
})
