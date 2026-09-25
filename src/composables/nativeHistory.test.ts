import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { defaultFrameConfig } from '../core/types'
const bridge = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../platform/env', () => ({ isAndroid: true, isTauri: true }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: bridge.invoke }))
const node = { id: 'n1', photoId: 'p1', name: '编辑', ts: 1, seq: 1, state: defaultFrameConfig }

beforeEach(() => { vi.resetModules(); bridge.invoke.mockReset() })
afterEach(() => vi.unstubAllGlobals())

it('routes Android history operations through committed native storage', async () => {
  bridge.invoke.mockImplementation(async (_command, args) => {
    if (args.operation === 'migrated') return 'true'
    if (args.operation === 'list') return JSON.stringify([node])
    if (args.operation === 'count') return '1'
    return 'null'
  })
  const history = await import('./useHistoryDB')
  await history.putHistoryNode(node)
  expect(await history.loadPhotoNodes('p1')).toEqual([node])
  expect(await history.countHistoryNodes()).toBe(1)
  await history.deleteHistoryNodes(['n1'])
  await history.deletePhotoChains(['p1', 'p2'])
  await history.clearAllHistoryNodes()
  expect(bridge.invoke.mock.calls.map(([, args]) => args.operation)).toEqual([
    'migrated', 'put', 'list', 'count', 'deleteIds', 'deletePhotos', 'clear',
  ])
})

it('does not fall back to stale IndexedDB when native reads fail', async () => {
  bridge.invoke.mockRejectedValue(new Error('SQLite 不可用'))
  const history = await import('./useHistoryDB')
  await expect(history.loadPhotoNodes('p1')).rejects.toThrow('SQLite 不可用')
  await expect(history.loadPhotoNodes('p1')).rejects.toThrow('SQLite 不可用')
  expect(bridge.invoke).toHaveBeenCalledTimes(2)
})

it('migrates undo position once and subsequently trusts SQLite', async () => {
  localStorage.setItem('frame-cursor:p1', 'old-node')
  bridge.invoke.mockImplementation(async (_command, args) => {
    if (args.operation === 'migrated') return 'true'
    return 'null'
  })
  const history = await import('./useHistoryDB')
  expect(await history.loadHistoryCursor('p1')).toBe('old-node')
  expect(bridge.invoke).toHaveBeenCalledWith('mobile_history', {
    operation: 'setCursor', payload: JSON.stringify({ photoId: 'p1', nodeId: 'old-node' }),
  })
  bridge.invoke.mockImplementation(async (_command, args) => args.operation === 'getCursor' ? '"new-node"' : 'null')
  expect(await history.loadHistoryCursor('p1')).toBe('new-node')
})

it('copies legacy data before marking migration complete and never deletes the old database', async () => {
  const batches = [[node], []]
  const request = (value: unknown) => {
    const req = { result: value, onsuccess: (() => {}) as () => void }
    queueMicrotask(() => req.onsuccess())
    return req
  }
  const deleteDatabase = vi.fn()
  vi.stubGlobal('IDBKeyRange', { lowerBound: vi.fn() })
  vi.stubGlobal('indexedDB', {
    deleteDatabase,
    open: () => request({
      transaction: () => ({ objectStore: () => ({ getAll: () => request(batches.shift()) }) }),
    }),
  })
  bridge.invoke.mockImplementation(async (_command, args) => args.operation === 'migrated' ? 'false' : 'null')
  const history = await import('./useHistoryDB')
  await history.putHistoryNode(node)
  expect(bridge.invoke.mock.calls.map(([, args]) => args.operation)).toEqual(['migrated', 'import', 'finishMigration', 'put'])
  expect(JSON.parse(bridge.invoke.mock.calls[1][1].payload)).toEqual({ nodes: [node] })
  expect(deleteDatabase).not.toHaveBeenCalled()
})
