import { defaultFrameConfig, type FrameConfig } from './types'
export const configModules = [
  { id: 'photo', label: '照片（缩放、旋转、裁剪）' },
  { id: 'background', label: '背景' },
  { id: 'border', label: '边框与画幅' },
  { id: 'creative', label: '创意水印' },
  { id: 'info', label: 'INFO 信息（内容和样式）' },
  { id: 'effects', label: '暗角、颗粒与普通水印' },
] as const
export type ConfigModule = typeof configModules[number]['id']
const groups: Record<string, ConfigModule> = {}
for (const k of ['scale','shadow','photoRadius','photoX','photoY','photoRotation','photoCrop']) groups[k] = 'photo'
for (const k of ['bgMode','showBackground','customBgImage','bgColor','blur','bgScale','bgOffsetX','bgOffsetY','bgExpand','bgBottomRatio']) groups[k] = 'background'
for (const k of ['padding','borderRatio','borderColor','borderRadius','frameRatio','showBorder']) groups[k] = 'border'
groups.creativeWatermark = 'creative'
groups.watermarkTint = 'effects'
groups.watermarkPosition = 'effects'
for (const k of ['vignette','grain','showWatermark','watermarkText','watermarkImage','watermarkOpacity','watermarkSize','watermarkAngle','watermarkTile','watermarkAlign','watermarkBottom']) groups[k] = 'effects'
const excluded = new Set(['photoSrc','canvasH','layerVisible'])
export function pickModules(config: FrameConfig, modules: ConfigModule[]): Partial<FrameConfig> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(defaultFrameConfig)) {
    if (!excluded.has(key) && modules.includes(groups[key] ?? 'info')) {
      const value = config[key as keyof FrameConfig]
      // Explicitly disabled, not undefined (JSON would silently drop the field).
      out[key] = key === 'creativeWatermark' && value === undefined ? { enabled: false, elements: [] } : value
    }
  }
  return JSON.parse(JSON.stringify(out))
}
/** Only the selected fields change; the target photo and all other modules stay intact. */
export function mergeModuleConfig(base: FrameConfig, partial: Partial<FrameConfig>): FrameConfig {
  const allowed = Object.fromEntries(Object.entries(partial).filter(([k]) => k in defaultFrameConfig && !excluded.has(k)))
  return { ...JSON.parse(JSON.stringify(base)), ...JSON.parse(JSON.stringify(allowed)), photoSrc: base.photoSrc, canvasH: base.canvasH }
}
