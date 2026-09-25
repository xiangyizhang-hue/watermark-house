export interface WatermarkElement {
  id: string; kind: 'text' | 'line'; enabled: boolean; text: string
  x: number; y: number; width: number; size: number; spacing: number
  color: string; opacity: number; font: string; weight: number
  align: 'left' | 'center' | 'right'; rotation: number
  edgeMargin?: number
}
export interface CreativeWatermark { enabled: boolean; linkBrands?: boolean; textBank?: Record<string,string>; elements: WatermarkElement[] }
/** Validate persisted data and detach it from reactive/template state. */
export function normalizeWatermark(raw: unknown): CreativeWatermark | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const v = raw as CreativeWatermark
  if (!Array.isArray(v.elements) || typeof v.enabled !== 'boolean') return undefined
  const elements: WatermarkElement[] = []
  for (const item of v.elements.slice(0, 200)) {
    if (!item || !['text', 'line'].includes(item.kind)) continue
    const e = { ...createWatermark().elements[0]! }
    for (const key of ['id','text','color','font'] as const) if (typeof item[key] === 'string') e[key] = item[key]
    e.kind = item.kind
    e.enabled = item.enabled !== false
    if (['left','center','right'].includes(item.align)) e.align = item.align
    for (const [key, min, max] of [['x',0,100],['y',0,100],['width',1,100],['size',.1,150],['spacing',0,30],['opacity',0,1],['weight',100,900],['rotation',-180,180]] as const) {
      if (typeof item[key] === 'number' && Number.isFinite(item[key])) e[key] = Math.min(max, Math.max(min, item[key]))
    }
    if (typeof item.edgeMargin === 'number' && Number.isFinite(item.edgeMargin)) e.edgeMargin = Math.min(45,Math.max(0,item.edgeMargin))
    elements.push(e)
  }
  const textBank = Object.fromEntries(Object.entries(v.textBank ?? {}).filter(([k,value]) => !['__proto__','constructor','prototype'].includes(k) && typeof value === 'string'))
  return { enabled: v.enabled, linkBrands: v.linkBrands === true, ...(v.textBank ? {textBank} : {}), elements }
}
export function updateWatermark(config: CreativeWatermark, index: number, values: Partial<WatermarkElement>): CreativeWatermark {
  const source = config.elements[index]
  if (!source) return config
  const changed = { ...source, ...values }
  const peer = source.id === '顶部品牌' ? '底部品牌' : source.id === '底部品牌' ? '顶部品牌' : ''
  const elements = config.elements.map((e,i) => i === index ? changed : config.linkBrands && peer && e.id === peer ? { ...changed, id: e.id, y: 100-changed.y } : { ...e })
  return { ...config, textBank: { ...config.textBank, ...Object.fromEntries(elements.filter(e => e.kind === 'text').map(e => [e.id,e.text])) }, elements }
}
/** Alignment buttons snap the anchor to the photo edge; x remains manually editable. */
export function watermarkAlignment(align: WatermarkElement['align'], margin = 5): Partial<WatermarkElement> {
  const edgeMargin = Math.min(45,Math.max(0,margin))
  return { align, edgeMargin, x: align === 'left' ? edgeMargin : align === 'right' ? 100-edgeMargin : 50 }
}
export function switchWatermarkStyle(previous: CreativeWatermark | undefined, style: number): CreativeWatermark {
  const next = createWatermark(style)
  if (!previous) return next
  const bank = { ...previous.textBank, ...Object.fromEntries(previous.elements.filter(e => e.kind === 'text').map(e => [e.id,e.text])) }
  next.textBank = bank
  next.linkBrands = previous.linkBrands ?? true
  next.elements = next.elements.map(e => {
    const old = previous.elements.find(p => p.id === e.id && p.kind === e.kind)
    return { ...e, ...(old ? { font: old.font, color: old.color, opacity: old.opacity, weight: old.weight, spacing: old.spacing } : {}), text: bank[e.id] ?? e.text }
  })
  const builtinIds = new Set(createWatermark().elements.map(e => e.id))
  next.elements.push(...previous.elements.filter(e => !builtinIds.has(e.id)).map(e => ({...e})))
  return updateWatermark(next,next.elements.findIndex(e => e.id === '顶部品牌'),{})
}
export const watermarkStyles = ['参考原版', '杂志左对齐', '极简落款', '双侧署名']
export function createWatermark(style = 0): CreativeWatermark {
  const text = (id: string, value: string, y: number, size = 14): WatermarkElement => ({ id, kind: 'text', enabled: true, text: value, x: 50, y, width: 94, size, spacing: 1.5, color: '#ffffff', opacity: .8, font: 'Arial, "Microsoft YaHei", sans-serif', weight: 400, align: 'center', rotation: 0 })
  const line = (id: string, y: number) => ({ ...text(id, '', y, 1), kind: 'line' as const, width: 100, opacity: .55 })
  let elements = [text('顶部品牌', 'YOUR STUDIO · PHOTOGRAPHY', 1.6), line('上横线', 3.4), text('作品标题', 'YOUR STORY', 6, 30), text('底部署名', 'CHARACTER · CN · PHOTOGRAPHER', 94), line('下横线', 96.2), text('底部品牌', 'YOUR STUDIO · PHOTOGRAPHY', 98)]
  if (style === 1) elements = elements.map(e => ({ ...e, x: 5, width: 90, align: 'left' }))
  if (style === 2) elements = [text('作品标题', 'YOUR STORY', 88, 26), { ...line('下横线', 92), width: 35 }, text('底部署名', 'PHOTOGRAPHY · YOUR NAME', 96)]
  if (style === 3) elements = [{ ...text('作品标题', 'YOUR STORY', 94, 22), x: 5, width: 43, align: 'left' }, { ...text('底部署名', 'PHX · YOUR NAME', 94), x: 95, width: 43, align: 'right' }, { ...line('下横线', 90), width: 90 }]
  const bottom = elements.find(e => e.id === '底部品牌')
  if (bottom) bottom.y = 98.4
  return { enabled: true, linkBrands: true, elements }
}
/** Coordinates are percentages; type and strokes scale with the short edge. */
export function drawCreativeWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, config?: CreativeWatermark) {
  if (!config?.enabled) return
  const unit = Math.min(w, h) / 720
  for (const e of config.elements) {
    if (!e.enabled) continue
    ctx.save()
    ctx.globalAlpha = e.opacity
    ctx.fillStyle = ctx.strokeStyle = e.color
    ctx.translate(w * e.x / 100, h * e.y / 100)
    ctx.rotate(e.rotation * Math.PI / 180)
    const available = w * Math.min(e.width, e.align === 'left' ? 100-e.x : e.align === 'right' ? e.x : 2*Math.min(e.x,100-e.x)) / 100
    if (e.kind === 'line') {
      const start = e.align === 'left' ? 0 : e.align === 'right' ? -available : -available/2
      ctx.lineWidth = e.size * unit
      ctx.beginPath(); ctx.moveTo(start, 0); ctx.lineTo(start + available, 0); ctx.stroke()
    } else {
      ctx.font = `${e.weight} ${e.size * unit}px ${e.font}`
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      const rows = e.text.split('\n')
      rows.forEach((row, i) => {
        const chars = Array.from(row)
        const spacing = e.spacing * unit
        const length = chars.reduce((n, c) => n + ctx.measureText(c).width, 0) + Math.max(0,chars.length-1)*spacing
        const fit = length > 0 ? Math.min(1, Math.max(0,available)/length) : 1
        ctx.save(); ctx.scale(fit, fit)
        let x = e.align === 'left' ? 0 : e.align === 'right' ? -length : -length/2
        for (const c of chars) { ctx.fillText(c, x, (i-(rows.length-1)/2)*e.size*unit*1.3); x += ctx.measureText(c).width+spacing }
        ctx.restore()
      })
    }
    ctx.restore()
  }
}
