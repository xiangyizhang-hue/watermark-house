import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const bridge = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('./env', () => ({ isAndroid: true, isTauri: true }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: bridge.invoke, convertFileSrc: (path: string) => `asset://${path}` }))
beforeEach(() => { vi.resetModules(); bridge.invoke.mockReset() })
afterEach(() => vi.unstubAllGlobals())
const record = () => ({ id: 'p1', name: 'photo.jpg', type: 'image/jpeg', size: 3, width: 100, height: 100, blob: new Blob(['abc']), exif: null, createdAt: 1, updatedAt: 1 })

it('commits original bytes before exposing a stable native resource path', async () => {
  bridge.invoke.mockImplementation(async (_command, args) => {
    if (args.operation === 'migrated') return 'true'
    if (args.operation === 'begin') return '"t1"'
    if (args.operation === 'finish') return '{"originalPath":"/files/originals/photo.jpg"}'
    return 'null'
  })
  const api = await import('./mobileAssets')
  const asset: import('./mobileAssets').MobileAssetRecord = record()
  await api.saveMobileAsset(asset)
  expect(asset.originalPath).toBe('/files/originals/photo.jpg')
  const calls = bridge.invoke.mock.calls.map(([, args]) => ({ operation: args.operation, payload: JSON.parse(args.payload) }))
  expect(calls.map(call => call.operation)).toEqual(['migrated', 'begin', 'chunk', 'finish'])
  expect(calls[1].payload.metadata.blob).toBeUndefined()
  expect(calls[2].payload.data).toBe('YWJj')
  expect(api.createMobileAssetUrl(undefined, asset.originalPath)).toBe('asset:///files/originals/photo.jpg')
})

it('aborts an incomplete import and reports the original failure', async () => {
  bridge.invoke.mockImplementation(async (_command, args) => {
    if (args.operation === 'migrated') return 'true'
    if (args.operation === 'begin') return '"t1"'
    if (args.operation === 'chunk') throw new Error('空间不足')
    return 'null'
  })
  const api = await import('./mobileAssets')
  const asset: import('./mobileAssets').MobileAssetRecord = record()
  await expect(api.saveMobileAsset(asset)).rejects.toThrow('空间不足')
  expect(asset.originalPath).toBeUndefined()
  expect(bridge.invoke.mock.calls.map(([, args]) => args.operation)).toEqual(['migrated', 'begin', 'chunk', 'abort'])
})

it('restores metadata without reading original blobs into the WebView', async () => {
  bridge.invoke.mockImplementation(async (_command, args) => {
    if (args.operation === 'migrated') return 'true'
    if (args.operation === 'list') return '[{"id":"p1","originalPath":"/files/p1.jpg","createdAt":1}]'
    return 'null'
  })
  const api = await import('./mobileAssets')
  const assets = await api.listMobileAssets()
  expect(assets[0].blob).toBeUndefined()
  expect(api.mobileRecordFile(assets[0])).toBeNull()
  expect(bridge.invoke.mock.calls.map(([, args]) => args.operation)).toEqual(['migrated', 'list'])
})

it('stores virtual copies as references, without writing any original bytes', async () => {
  bridge.invoke.mockImplementation(async (_command, args) => args.operation === 'migrated' ? 'true' : 'null')
  const api = await import('./mobileAssets')
  await api.saveMobileCopy({ id: 'copy1', sourceId: 'p1', name: '副本', createdAt: 1, updatedAt: 1 })
  expect(bridge.invoke.mock.calls.map(([, args]) => args.operation)).toEqual(['migrated', 'saveCopy'])
})

it('migrates old originals before copies without deleting the old database', async () => {
  const batches: Record<string, unknown[][]> = {
    assets: [[record()], []],
    copies: [[{ id: 'copy1', sourceId: 'p1', name: '副本', createdAt: 1, updatedAt: 1 }], []],
  }
  const request = (value: unknown) => {
    const result = { result: value, onsuccess: () => {} }
    queueMicrotask(() => result.onsuccess())
    return result
  }
  const deleteDatabase = vi.fn()
  vi.stubGlobal('indexedDB', {
    deleteDatabase,
    open: () => request({ close: vi.fn(), transaction: (name: string) => ({ objectStore: () => ({ getAll: () => request(batches[name].shift()) }) }) }),
  })
  vi.stubGlobal('IDBKeyRange', { lowerBound: vi.fn() })
  let imported = false
  bridge.invoke.mockImplementation(async (_command, args) => {
    if (args.operation === 'migrated') return 'false'
    if (args.operation === 'exists') return String(imported)
    if (args.operation === 'begin') return '"t1"'
    if (args.operation === 'finish') { imported = true; return '{"originalPath":"/files/p1.jpg"}' }
    if (args.operation === 'list') return '[]'
    return 'null'
  })
  const api = await import('./mobileAssets')
  await api.listMobileAssets()
  expect(bridge.invoke.mock.calls.map(([, args]) => args.operation)).toEqual([
    'migrated', 'exists', 'begin', 'chunk', 'finish', 'exists', 'saveCopy', 'finishMigration', 'list',
  ])
  expect(deleteDatabase).not.toHaveBeenCalled()
})
