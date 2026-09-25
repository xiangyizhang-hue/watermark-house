import { beforeEach, expect, it, vi } from 'vitest'
import type { HistoryNodeRecord } from './useHistoryDB'
const database = vi.hoisted(() => ({ nodes: new Map<string,HistoryNodeRecord>(), seq: 0 }))
vi.mock('./useHistoryDB', () => ({
  loadHistoryCursor: async (id:string) => localStorage.getItem(`frame-cursor:${id}`),
  saveHistoryCursor: async (id:string, node:string) => { localStorage.setItem(`frame-cursor:${id}`, node) },
  loadPhotoNodes: async (id:string) => [...database.nodes.values()].filter(n => n.photoId === id).sort((a,b) => a.seq-b.seq).map(n => JSON.parse(JSON.stringify(n))),
  recoverLegacyNodes: async () => [],
  putHistoryNode: async (node:HistoryNodeRecord) => { await Promise.resolve(); database.nodes.set(node.id, JSON.parse(JSON.stringify(node))) },
  deleteHistoryNodes: async (ids:string[]) => ids.forEach(id => database.nodes.delete(id)),
  deletePhotoChain: async () => {}, clearAllHistoryNodes: async () => {}, countHistoryNodes: async () => database.nodes.size,
  nextSeq: () => ++database.seq,
}))
beforeEach(() => { vi.resetModules(); database.nodes.clear(); database.seq=0; localStorage.clear() })
it('persists mobile undecorated reset and can undo it after restart', async () => {
  let app = await session()
  const { defaultFrameConfig } = await import('../core/types')
  await app.history.importPhoto('photo:e:/a.jpg', defaultFrameConfig)
  await app.select('photo:e:/a.jpg')
  app.frame.patch({ showBorder: true, showWatermark: true, cameraModel: 'vivo X100s' })
  await app.history.saveAllPending()
  app.frame.resetUndecorated()
  await app.history.saveAllPending()
  vi.resetModules()
  app = await session()
  await app.select('photo:e:/a.jpg')
  expect(app.frame.state.showBorder).toBe(false)
  expect(app.frame.state.showWatermark).toBe(false)
  expect(app.frame.state.infoLayer.enabled).toBe(false)
  expect(app.frame.state.cameraModel).toBe('vivo X100s')
  await app.history.undo()
  expect(app.frame.state.showBorder).toBe(true)
  expect(app.frame.state.showWatermark).toBe(true)
})
async function session() {
  const history = await import('./useHistory')
  const frame = (await import('./useFrameConfig')).useFrameConfig()
  let id = 'photo:e:/a.jpg'
  history.registerActiveProvider(() => ({id,url:id}))
  const select = async (value:string) => { await history.saveAllPending(); id=value; await history.ensureChain(id); history.loadCursorFor(id) }
  return { history, frame, select }
}
it('restores independent edits and undo cursor after module restart', async () => {
  let app = await session()
  const {defaultFrameConfig} = await import('../core/types')
  const {createWatermark} = await import('../core/creativeWatermark')
  await app.history.importPhoto('photo:e:/a.jpg',defaultFrameConfig)
  await app.history.importPhoto('photo:e:/b.jpg',defaultFrameConfig)
  await app.select('photo:e:/a.jpg')
  app.frame.patch({creativeWatermark:createWatermark(),padding:17})
  await app.history.saveAllPending()
  app.frame.patch({padding:21})
  await app.history.saveAllPending()
  await app.history.undo()
  await app.select('photo:e:/b.jpg')
  app.frame.state.padding=33 // v-model edits must also be recorded
  await app.history.saveAllPending()
  vi.resetModules()
  app=await session()
  await app.select('photo:e:/a.jpg')
  expect(app.frame.state.padding).toBe(17)
  expect(app.frame.state.creativeWatermark?.enabled).toBe(true)
  await app.history.redo()
  expect(app.frame.state.padding).toBe(21)
  await app.select('photo:e:/b.jpg')
  expect(app.frame.state.padding).toBe(33)
  expect(app.frame.state.creativeWatermark).toBeUndefined()
})
it('captures changes immediately so suspended photo switches do not discard them', async () => {
  const app=await session()
  const {defaultFrameConfig} = await import('../core/types')
  await app.history.importPhoto('photo:e:/a.jpg',defaultFrameConfig)
  await app.select('photo:e:/a.jpg')
  app.frame.patch({padding:25})
  app.frame.suspendCommit(true)
  await app.history.saveAllPending()
  app.frame.suspendCommit(false)
  expect([...database.nodes.values()].some(n => n.state.padding === 25)).toBe(true)
})

it('duplicates the current cursor into an independent persistent chain', async () => {
  let app = await session()
  const {defaultFrameConfig} = await import('../core/types')
  await app.history.importPhoto('photo:e:/a.jpg',defaultFrameConfig)
  await app.select('photo:e:/a.jpg')
  app.frame.patch({padding:25, paletteColors:['#112233','#445566']})
  await app.history.duplicatePhotoHistory('photo:e:/a.jpg','copy:test')
  await app.select('copy:test')
  expect(app.frame.state.padding).toBe(25)
  app.frame.patch({padding:80,paletteColors:['#abcdef','#fedcba']})
  await app.history.saveAllPending()
  await app.select('photo:e:/a.jpg')
  expect(app.frame.state.padding).toBe(25)
  expect(app.frame.state.paletteColors).toEqual(['#112233','#445566'])
  vi.resetModules(); app = await session()
  await app.select('copy:test')
  expect(app.frame.state.padding).toBe(80)
  expect(app.frame.state.paletteColors).toEqual(['#abcdef','#fedcba'])
})
