import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultFrameConfig } from '../core/types'
beforeEach(() => { vi.resetModules(); localStorage.clear() })
afterEach(() => vi.restoreAllMocks())
it('publishes a saved template only after storage accepts it', async () => {
  const { useTemplates } = await import('./useTemplates')
  const api = useTemplates()
  const count = api.templates.length
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
  expect(() => api.saveCurrent('test', structuredClone(defaultFrameConfig))).toThrow('full')
  expect(api.templates).toHaveLength(count)
  write.mockRestore()
  api.saveCurrent('test', structuredClone(defaultFrameConfig))
  expect(JSON.parse(localStorage.getItem('frame-templates')!)[0].name).toBe('test')
  expect(api.templates).toHaveLength(count + 1)
})
it('preserves a template when rename or delete cannot be persisted', async () => {
  const { useTemplates } = await import('./useTemplates')
  const api = useTemplates()
  api.saveCurrent('kept', structuredClone(defaultFrameConfig))
  const id = api.templates.find(item => item.name === 'kept')!.id
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
  expect(() => api.rename(id, 'lost')).toThrow()
  expect(() => api.remove(id)).toThrow()
  expect(api.templates.find(item => item.id === id)?.name).toBe('kept')
})
it('retains explicit custom logos through save and apply without freezing EXIF brands', async () => {
  const { useTemplates, applyTemplateToState } = await import('./useTemplates')
  const { useFrameConfig } = await import('./useFrameConfig')
  const api = useTemplates()
  api.saveCurrent('logo', { ...structuredClone(defaultFrameConfig), brand:'custom:logo1', showLogo:true })
  const saved = api.templates.find(t => t.name === 'logo')!
  expect(saved.config.brand).toBe('custom:logo1')
  const frame = useFrameConfig()
  frame.loadConfig({ ...structuredClone(defaultFrameConfig), photoSrc:'blob:other', exifRaw:null })
  applyTemplateToState(saved.config)
  expect(frame.state.brand).toBe('custom:logo1')
  expect(frame.state.photoSrc).toBe('blob:other')
  expect(api.toTemplateConfig({...structuredClone(defaultFrameConfig),brand:'sony'}).brand).toBeUndefined()
})
