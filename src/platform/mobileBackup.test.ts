import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ invoke: vi.fn(), logos: vi.fn(), put: vi.fn(), merge: vi.fn(), init: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mock.invoke }))
vi.mock('../composables/useLogoDB', () => ({ getAllCustomLogos: mock.logos, putCustomLogos: mock.put }))
vi.mock('../composables/useLogoStore', () => ({ initCustomLogos: mock.init }))
vi.mock('../composables/useTemplates', () => ({ useTemplates: () => ({ templates: [], mergeRestored: mock.merge }) }))
import { validateBackupUI, finishPendingRestore, prepareBackupRestore, importMobileTemplate } from './mobileBackup'
const fixture = () => ({ templates: [{ id: 't1', name: '水印', category: 'all', config: {} }], logos: [] })
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); mock.logos.mockResolvedValue([]); mock.put.mockResolvedValue(undefined) })
it('rejects invalid, repeated IDs and remote logo dependencies', () => {
  expect(() => validateBackupUI(fixture())).not.toThrow()
  expect(() => validateBackupUI({ ...fixture(), logos: [{ id:'svg1', name:'SVG Logo', dataURL:'data:image/svg+xml;base64,PHN2Zy8+' }] })).not.toThrow()
  expect(() => validateBackupUI({ templates: [fixture().templates[0], fixture().templates[0]], logos: [] })).toThrow()
  expect(() => validateBackupUI({ ...fixture(), logos: [{ id:'l1', name:'logo', dataURL:'https://example.com/x.png' }] })).toThrow()
  expect(() => validateBackupUI({ ...fixture(), templates:[{...fixture().templates[0], config:null}] })).toThrow()
})
it('does not clear native recovery marker if template persistence fails', async () => {
  mock.invoke.mockResolvedValue(JSON.stringify(fixture()))
  mock.merge.mockImplementation(() => { throw new Error('quota') })
  await expect(finishPendingRestore()).rejects.toThrow('quota')
  expect(mock.invoke.mock.calls.map(([, a]) => a.operation)).toEqual(['backupPending'])
})
it('retries stable IDs and clears pending only after durable logo and template writes', async () => {
  mock.invoke.mockImplementation(async (_, a) => a.operation === 'backupPending' ? JSON.stringify(fixture()) : 'null')
  await finishPendingRestore(); await finishPendingRestore()
  expect(mock.merge.mock.calls[0][0]).toEqual(mock.merge.mock.calls[1][0])
  expect(mock.invoke.mock.calls.map(([, a]) => a.operation)).toEqual(['backupPending','backupFinish','backupPending','backupFinish'])
})
it('rejects staged invalid UI before any native commit and discards staging', async () => {
  mock.invoke.mockResolvedValueOnce(JSON.stringify({ token: 'stage', ui: {} })).mockResolvedValueOnce('null')
  await expect(prepareBackupRestore()).rejects.toThrow()
  expect(mock.invoke.mock.calls.map(([, a]) => a.operation)).toEqual(['backupOpen','backupDiscard'])
})
it('picker cancellation changes no templates or logos', async () => {
  mock.invoke.mockResolvedValue('null')
  expect(await importMobileTemplate()).toBe(false)
  expect(mock.merge).not.toHaveBeenCalled(); expect(mock.put).not.toHaveBeenCalled()
})
it('rejects unsupported template versions and missing logos before writes', async () => {
  mock.invoke.mockResolvedValue(JSON.stringify(JSON.stringify({kind:'frame-template',version:9,template:fixture().templates[0]})))
  await expect(importMobileTemplate()).rejects.toThrow()
  mock.invoke.mockResolvedValue(JSON.stringify(JSON.stringify({kind:'frame-template',version:1,template:{...fixture().templates[0],config:{brand:'custom:missing'}}})))
  await expect(importMobileTemplate()).rejects.toThrow('Logo')
  expect(mock.put).not.toHaveBeenCalled()
})
it('imports an embedded logo under a fresh ID and rewrites its template reference', async () => {
  mock.invoke.mockResolvedValue(JSON.stringify(JSON.stringify({kind:'frame-template',version:1,
    template:{...fixture().templates[0],config:{brand:'custom:l1'}},
    logos:[{id:'l1',name:'SVG',dataURL:'data:image/svg+xml;base64,PHN2Zy8+'}],
  })))
  expect(await importMobileTemplate()).toBe(true)
  const logo = mock.put.mock.calls[0][0][0]
  expect(logo.id).not.toBe('l1')
  expect(mock.merge.mock.calls[0][0][0].config.brand).toBe(`custom:${logo.id}`)
})
it('keeps existing snapshots and deduplicates retries by restored snapshot ID', async () => {
  const old = {id:'old',photoId:'p0',name:'原有快照',ts:1,state:{padding:1}}
  const restored = {id:'new',photoId:'p1',name:'恢复快照',ts:2,state:{padding:42}}
  localStorage.setItem('frame-snapshots',JSON.stringify([old]))
  mock.invoke.mockImplementation(async (_, a) => a.operation === 'backupPending' ? JSON.stringify({...fixture(),snapshots:[restored]}) : 'null')
  await finishPendingRestore(); await finishPendingRestore()
  expect(JSON.parse(localStorage.getItem('frame-snapshots')!)).toEqual([old,restored])
})
