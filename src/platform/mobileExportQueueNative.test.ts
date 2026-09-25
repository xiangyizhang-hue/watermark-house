import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultFrameConfig } from '../core/types'
const native = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn() }))
vi.mock('./env', () => ({ isAndroid: true, isTauri: true }))
vi.mock('./mobileNativeStore', () => ({
  saveMobileNativeRecord: native.save,
  deleteMobileNativeRecord: native.remove,
  loadMobileNativeRecord: vi.fn().mockResolvedValue(null),
}))
import { saveMobileExportJob, clearMobileExportJob, loadMobileExportJob, type MobileExportJob } from './mobileExportQueue'
const job = (): MobileExportJob => ({
  version: 1, status: 'running', ids: ['photo'], cursor: 0, format: 'jpg',
  jpgQuality: 0.9, supersample: 1, backfillExif: false, rulesEnabled: false,
  rulesText: '', baseConfig: structuredClone(defaultFrameConfig), updatedAt: 1,
})
describe('native export queue commit ordering', () => {
  beforeEach(() => {
    localStorage.clear()
    native.save.mockReset().mockResolvedValue(true)
    native.remove.mockReset().mockResolvedValue(true)
  })
  it('does not report a failed SQLite save as successful', async () => {
    native.save.mockResolvedValue(false)
    expect(await saveMobileExportJob(job())).toBe(false)
    expect(loadMobileExportJob()).toBeNull()
  })
  it('waits for pending writes before deleting the queue', async () => {
    let commit!: (value: boolean) => void
    native.save.mockImplementationOnce(() => new Promise<boolean>(resolve => { commit = resolve }))
    const saving = saveMobileExportJob(job())
    const clearing = clearMobileExportJob()
    await vi.waitFor(() => expect(native.save).toHaveBeenCalledOnce())
    expect(native.remove).not.toHaveBeenCalled()
    commit(true)
    expect(await saving).toBe(true)
    expect(await clearing).toBe(true)
    expect(loadMobileExportJob()).toBeNull()
  })
  it('keeps the recoverable job when native deletion fails', async () => {
    await saveMobileExportJob(job())
    native.remove.mockResolvedValue(false)
    expect(await clearMobileExportJob()).toBe(false)
    expect(loadMobileExportJob()?.ids).toEqual(['photo'])
  })
})
