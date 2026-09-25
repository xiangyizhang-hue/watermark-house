import { beforeEach, expect, it, vi } from 'vitest'
const native = vi.hoisted(() => ({ invoke: vi.fn(), download: vi.fn() }))
vi.mock('./env', () => ({ isMobile: true, isTauri: true }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }))
vi.mock('../core/exporter', () => ({ downloadBlob: native.download }))
import { saveMobileBlob } from './mobileExport'
beforeEach(() => vi.clearAllMocks())

it('does not claim successful download when native storage rejects the export', async () => {
  native.invoke.mockRejectedValue(new Error('空间不足'))
  await expect(saveMobileBlob(new Blob(['image']), 'photo.jpg')).rejects.toThrow('空间不足')
  expect(native.download).not.toHaveBeenCalled()
})

it('aborts pending media after finalization fails and preserves the error', async () => {
  native.invoke.mockImplementation(async (command: string) => {
    if (command === 'mobile_begin_media') return 'token'
    if (command === 'mobile_finish_media') throw new Error('提交失败')
  })
  await expect(saveMobileBlob(new Blob([]), 'photo.jpg')).rejects.toThrow('提交失败')
  expect(native.invoke).toHaveBeenCalledWith('mobile_abort_media', { token: 'token' })
  expect(native.download).not.toHaveBeenCalled()
})

it('returns success only when native media commit provides a location', async () => {
  native.invoke.mockImplementation(async (command: string) => {
    if (command === 'mobile_begin_media') return 'token'
    if (command === 'mobile_finish_media') return 'content://media/123'
  })
  await expect(saveMobileBlob(new Blob([]), 'photo.jpg')).resolves.toEqual({ mode: 'native', location: 'content://media/123' })
})
