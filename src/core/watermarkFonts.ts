export const watermarkFonts = [
  { label: 'Bebas Neue · 海报长标题', value: '"Bebas Neue", "Microsoft YaHei", sans-serif' },
  { label: 'Marcellus · 古典电影', value: '"Marcellus", "Microsoft YaHei", serif' },
  { label: 'Rajdhani · 科幻字幕', value: '"Rajdhani", "Microsoft YaHei", sans-serif' },
  { label: '默认无衬线', value: 'Arial, "Microsoft YaHei", sans-serif' },
  { label: 'Cormorant Garamond · 优雅衬线', value: '"Cormorant Garamond", "Microsoft YaHei", serif' },
  { label: 'Cinzel · 电影标题', value: '"Cinzel", "Microsoft YaHei", serif' },
  { label: 'Oswald · 杂志窄体', value: '"Oswald", "Microsoft YaHei", sans-serif' },
  { label: '马善政 · 中文书写', value: '"Ma Shan Zheng", serif' },
  { label: '站酷小薇 · 中文文艺', value: '"ZCOOL XiaoWei", serif' },
]
export async function loadWatermarkFonts(config?: import('./creativeWatermark').CreativeWatermark): Promise<void> {
  if (!config?.enabled || !document.fonts?.load) return
  await Promise.all(config.elements.filter(e => e.enabled && e.kind === 'text').map(e => document.fonts.load(`${e.weight} 24px ${e.font}`, e.text || 'A')))
}
