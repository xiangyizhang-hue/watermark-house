import { invoke } from '@tauri-apps/api/core'
import { getAllCustomLogos, putCustomLogos, type CustomLogoRecord } from '../composables/useLogoDB'
import { initCustomLogos } from '../composables/useLogoStore'
import { useTemplates, type FrameTemplate } from '../composables/useTemplates'
import type { Snapshot } from '../composables/useHistory'

export interface BackupUI { templates: FrameTemplate[]; logos: CustomLogoRecord[]; snapshots?: Snapshot[] }
export interface BackupPreview { token: string; photos: number; copies: number; history: number; createdAt: number; ui: BackupUI }
export async function mobileDocument<T>(operation: string, payload: object = {}): Promise<T> {
  return JSON.parse(await invoke<string>('mobile_assets', { operation, payload: JSON.stringify(payload) })) as T
}

/** Reject incompatible archives before native photo/history commit. */
export function validateBackupUI(value: unknown): asserts value is BackupUI {
  const ui = value as BackupUI
  if (!ui || !Array.isArray(ui.templates) || !Array.isArray(ui.logos) || ui.templates.length > 10000 || ui.logos.length > 1000) throw new Error('备份模板或素材清单无效')
  const ids = new Set<string>()
  for (const item of [...ui.templates, ...ui.logos]) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim()) throw new Error('备份名称或标识重复/无效')
    ids.add(item.id)
  }
  for (const t of ui.templates) {
    if (!t.config || typeof t.config !== 'object' || Array.isArray(t.config) || !['all', 'frame', 'background'].includes(t.category) || t.builtin) throw new Error('备份模板参数无效')
  }
  for (const logo of ui.logos) {
    // Match the existing image uploader, including SVG/GIF logos. Images are decoded
    // only through <img>/canvas; never inject imported SVG as document markup.
    if (typeof logo.dataURL !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+=*$/i.test(logo.dataURL)) throw new Error('备份素材必须是内嵌图片')
  }
  if (ui.snapshots !== undefined) {
    if (!Array.isArray(ui.snapshots) || ui.snapshots.length > 10000) throw new Error('快照清单无效')
    for (const s of ui.snapshots) {
      if (!s || typeof s.id !== 'string' || !s.id || ids.has(s.id) || typeof s.photoId !== 'string' || typeof s.name !== 'string' || !Number.isFinite(s.ts) || !s.state || typeof s.state !== 'object' || Array.isArray(s.state)) throw new Error('快照内容无效')
      ids.add(s.id)
    }
  }
}

export async function collectBackupUI(): Promise<BackupUI> {
  const ui = { templates: JSON.parse(JSON.stringify(useTemplates().templates.filter(t => !t.builtin))), logos: await getAllCustomLogos(), snapshots: JSON.parse(localStorage.getItem('frame-snapshots') || '[]') }
  validateBackupUI(ui)
  return ui
}

async function mergeUI(ui: BackupUI): Promise<void> {
  validateBackupUI(ui)
  await putCustomLogos(ui.logos)
  useTemplates().mergeRestored(ui.templates)
  if (ui.snapshots?.length) {
    const current: Snapshot[] = JSON.parse(localStorage.getItem('frame-snapshots') || '[]')
    if (!Array.isArray(current)) throw new Error('现有快照数据无效，已保留，请勿清空数据')
    const ids = new Set(current.map(s => s.id))
    localStorage.setItem('frame-snapshots', JSON.stringify([...current, ...ui.snapshots.filter(s => !ids.has(s.id))]))
  }
  await initCustomLogos()
}

// Pending payload lives in the SAME native transaction as the restored photos.
// Replaying stable IDs after a quota failure or process death cannot duplicate UI records.
export async function finishPendingRestore(): Promise<boolean> {
  const ui = await mobileDocument<BackupUI | null>('backupPending')
  if (!ui) return false
  await mergeUI(ui)
  await mobileDocument('backupFinish')
  return true
}

export async function prepareBackupRestore(): Promise<BackupPreview | null> {
  const preview = await mobileDocument<BackupPreview | null>('backupOpen')
  if (preview) {
    try { validateBackupUI(preview.ui) }
    catch (error) { await mobileDocument('backupDiscard', { token: preview.token }); throw error }
  }
  return preview
}

export async function commitBackupRestore(token: string): Promise<void> {
  await mobileDocument('backupCommit', { token })
  await finishPendingRestore()
}

export async function exportMobileTemplate(id: string): Promise<boolean> {
  const store = useTemplates()
  const template = store.templates.find(t => t.id === id)
  if (!template) throw new Error('模板不存在')
  const serialized = JSON.stringify(template.config)
  const logos = (await getAllCustomLogos()).filter(l => serialized.includes(JSON.stringify(`custom:${l.id}`)))
  return !!await mobileDocument('documentExport', {
    filename: `${template.name.replace(/[\\/:*?"<>|]/g, '_')}.framelab.json`,
    text: JSON.stringify({ kind: 'frame-template', version: 1, template, logos }),
  })
}

export async function importMobileTemplate(): Promise<boolean> {
  const text = await mobileDocument<string | null>('documentOpen')
  if (text === null) return false
  const data = JSON.parse(text)
  if (data?.kind !== 'frame-template' || data.version !== 1 || !data.template) throw new Error('不是支持的 水印小屋 模板文件')
  const template = { ...data.template, builtin: false, category: data.template.category || 'all' }
  const ui: BackupUI = { templates: [template], logos: data.logos ?? [] }
  validateBackupUI(ui)
  let config = JSON.stringify(template.config)
  const logos = ui.logos.map(l => {
    const id = `logo_import_${crypto.randomUUID()}`
    config = config.split(JSON.stringify(`custom:${l.id}`)).join(JSON.stringify(`custom:${id}`))
    return { ...l, id }
  })
  const known = new Set([...logos, ...await getAllCustomLogos()].map(l => `custom:${l.id}`))
  for (const match of config.matchAll(/"(custom:[^"\\]+)"/g)) {
    if (!known.has(match[1])) throw new Error('模板缺少自定义 Logo，请从新版本重新导出包含素材的模板')
  }
  await mergeUI({ templates: [{ ...template, id: `template_import_${crypto.randomUUID()}`, config: JSON.parse(config) }], logos })
  return true
}
