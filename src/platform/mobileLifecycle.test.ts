import { afterEach, expect, it, vi } from 'vitest'
vi.mock('./env', () => ({ isMobile: true }))
import { installMobilePersistence, markMobileDirty, markMobileSaved, mobileEditRevision, mobilePersistenceState } from './mobileLifecycle'

it('updates the saved label only for the revision actually committed', () => {
  markMobileDirty()
  const revision = mobileEditRevision()
  markMobileDirty()
  markMobileSaved(revision)
  expect(mobilePersistenceState.value).toBe('pending')
  markMobileSaved(mobileEditRevision())
  expect(mobilePersistenceState.value).toBe('saved')
})

let cleanup = () => {}
afterEach(() => cleanup())

it('does not claim newer edits were saved by an older lifecycle flush', async () => {
  let finish!: () => void
  const flush = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  cleanup = installMobilePersistence(flush)
  markMobileDirty()
  window.dispatchEvent(new Event('pagehide'))
  await Promise.resolve()
  markMobileDirty()
  finish()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(mobilePersistenceState.value).toBe('pending')
})

it('shows a synchronous storage failure and allows retry', async () => {
  const flush = vi.fn().mockImplementationOnce(() => { throw new Error('disk full') }).mockResolvedValue(undefined)
  cleanup = installMobilePersistence(flush)
  window.dispatchEvent(new Event('pagehide'))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(mobilePersistenceState.value).toBe('error')
  window.dispatchEvent(new Event('pagehide'))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(mobilePersistenceState.value).toBe('saved')
})
