import { beforeEach, describe, expect, it } from 'vitest'
import { defaultFrameConfig } from '../core/types'
import {
  clearMobileExportJob,
  loadMobileExportJob,
  pauseMobileExportJob,
  saveMobileExportJob,
  mobileExportResumeCursor,
  mobileExportJobComplete,
  type MobileExportJob,
} from './mobileExportQueue'

function makeJob(overrides: Partial<MobileExportJob> = {}): MobileExportJob {
  return {
    version: 1,
    status: 'running',
    ids: ['a', 'b'],
    cursor: 0,
    format: 'jpg',
    jpgQuality: 0.92,
    supersample: 1,
    backfillExif: true,
    rulesEnabled: false,
    rulesText: '',
    baseConfig: structuredClone(defaultFrameConfig),
    configs: {
      a: structuredClone(defaultFrameConfig),
    },
    updatedAt: 0,
    ...overrides,
  }
}

describe('mobile export queue persistence', () => {
  it('retries failed photos even after the attempt cursor reached the end', () => {
    const job = makeJob({ cursor: 2, completed: { b: { name: 'b.jpg', location: 'media:2', savedAt: 1 } } })
    expect(mobileExportResumeCursor(job)).toBe(0)
    expect(mobileExportJobComplete(job)).toBe(false)
  })
  it('only clears a queue when every output is confirmed saved', () => {
    const job = makeJob({ cursor: 1, completed: {
      a: { name: 'a.jpg', location: 'media:1', savedAt: 1 },
      b: { name: 'b.jpg', location: 'media:2', savedAt: 1 },
    } })
    expect(mobileExportResumeCursor(job)).toBe(2)
    expect(mobileExportJobComplete(job)).toBe(true)
  })
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips a frozen job including per-photo configurations', async () => {
    const job = makeJob({ cursor: 1, status: 'paused' })
    expect(await saveMobileExportJob(job)).toBe(true)

    const loaded = loadMobileExportJob()
    expect(loaded?.ids).toEqual(['a', 'b'])
    expect(loaded?.cursor).toBe(1)
    expect(loaded?.status).toBe('paused')
    expect(loaded?.configs?.a?.padding).toBe(defaultFrameConfig.padding)
    expect(loaded?.updatedAt).toBeGreaterThan(0)
    expect(loaded?.jobId).toBeTruthy()
    expect(loaded?.completed).toEqual({})
  })

  it('does not restore malformed or out-of-range jobs', async () => {
    await saveMobileExportJob(makeJob({ cursor: -1 }))
    expect(loadMobileExportJob()).toBeNull()

    await saveMobileExportJob(makeJob())
    localStorage.setItem('framelab-mobile-export-job-v1', JSON.stringify({ version: 1, status: 'done' }))
    expect(loadMobileExportJob()).toBeNull()
  })

  it('pauses the same frozen job without losing its cursor', async () => {
    const job = makeJob({ cursor: 1 })
    await saveMobileExportJob(job)
    await pauseMobileExportJob(job)

    expect(loadMobileExportJob()).toMatchObject({
      status: 'paused',
      cursor: 1,
      ids: ['a', 'b'],
    })
  })

  it('keeps completed outputs when a process is interrupted after writing a file', async () => {
    const job = makeJob({
      completed: { a: { name: 'a_job_001.jpg', location: 'media:1', savedAt: 1 } },
    })
    await saveMobileExportJob(job)
    const loaded = loadMobileExportJob()
    expect(loaded?.completed?.a).toMatchObject({ name: 'a_job_001.jpg', location: 'media:1' })
    expect(loaded?.jobId).toBeTruthy()
  })

  it('clears a completed job', async () => {
    await saveMobileExportJob(makeJob())
    await clearMobileExportJob()
    expect(loadMobileExportJob()).toBeNull()
  })

  it.each([
    { cursor: 3 }, { cursor: 0.5 }, { jpgQuality: 2 },
    { supersample: 0 }, { updatedAt: 'invalid' }, { baseConfig: null },
  ])('rejects corrupt recovery values: %j', (overrides) => {
    localStorage.setItem('framelab-mobile-export-job-v1', JSON.stringify({ ...makeJob(), ...overrides }))
    expect(loadMobileExportJob()).toBeNull()
  })
})
