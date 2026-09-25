import { describe, expect, it, vi } from 'vitest'
import { RenderPlanRecorder, replayRenderPlan } from './renderPlan'
import { createRenderSurface } from './renderSurface'

function recorder() {
  const metrics = { save: vi.fn(), restore: vi.fn(), font: '10px sans-serif', measureText: vi.fn(() => ({ width: 42 })) } as unknown as CanvasRenderingContext2D
  const resolve = vi.fn(() => ({ uri: '/private/originals/test.jpg', width: 10000, height: 10000 }))
  return { record: new RenderPlanRecorder(metrics, resolve), metrics, resolve }
}
describe('portable display list', () => {
  it('records a 100MP original reference, not its decoded pixels', () => {
    const { record, resolve } = recorder()
    const surface = createRenderSurface(10000, 10000, record.createSurface)
    const source = { width: 10000, height: 10000 } as HTMLCanvasElement
    const ctx = surface.getContext('2d')!
    ctx.drawImage(source, 0, 0)
    ctx.drawImage(source, 50, 50)
    const plan = record.finish(surface)
    expect(resolve).toHaveBeenCalledOnce()
    expect(plan.images).toHaveLength(1)
    expect(JSON.stringify(plan).length).toBeLessThan(1000)
    expect(plan.surfaces[0].commands.map(command => command.op)).toEqual(['drawImage', 'drawImage'])
  })
  it('restores drawing state and uses the current font for measurement', () => {
    const { record, metrics } = recorder()
    const surface = record.createSurface(600, 400)
    const ctx = surface.getContext('2d')!
    ctx.font = '20px TestFont'
    ctx.save()
    ctx.font = '40px TestFont'
    expect(ctx.measureText('测试').width).toBe(42)
    expect(metrics.font).toBe('40px TestFont')
    ctx.restore()
    expect(ctx.font).toBe('20px TestFont')
    expect(metrics.restore).toHaveBeenCalledOnce()
  })
  it('references nested surfaces and gradients without rasterizing them', () => {
    const { record, resolve } = recorder()
    const root = record.createSurface(6000, 4000)
    const photo = record.createSurface(6000, 4000)
    const ctx = root.getContext('2d')!
    ctx.drawImage(photo, 0, 0)
    const gradient = ctx.createRadialGradient(10, 10, 0, 10, 10, 20)
    gradient.addColorStop(0, 'transparent')
    gradient.addColorStop(1, '#000')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 6000, 4000)
    const plan = record.finish(root)
    expect(resolve).not.toHaveBeenCalled()
    expect(plan.surfaces).toHaveLength(2)
    expect(plan.surfaces[0].commands[0].args[0]).toBe('surface-1')
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan)
  })
  it('freezes submitted commands and rejects unsupported operations', () => {
    const { record } = recorder()
    const root = record.createSurface(20, 20)
    const ctx = root.getContext('2d')!
    ctx.fillRect(0, 0, 2, 2)
    const plan = record.finish(root)
    ctx.fillRect(0, 0, 4, 4)
    expect(plan.surfaces[0].commands).toHaveLength(1)
    expect(() => ctx.getImageData(0, 0, 1, 1)).toThrow('尚不支持')
    expect(() => ctx.translate(NaN, 0)).toThrow('不可序列化')
  })
  it('rejects ephemeral original references', () => {
    const { metrics } = recorder()
    const record = new RenderPlanRecorder(metrics, () => ({ uri: 'blob:expired', width: 1, height: 1 }))
    const ctx = record.createSurface(1, 1).getContext('2d')!
    expect(() => ctx.drawImage({} as HTMLCanvasElement, 0, 0)).toThrow('持久本地资源')
  })
  it('replays paths, nested layers, fonts, gradients and patterns in recorded order', () => {
    const first = recorder(), second = recorder()
    const root = first.record.createSurface(600, 400)
    const layer = first.record.createSurface(600, 400)
    const child = layer.getContext('2d')!
    child.fillStyle = '#123456'
    child.fillRect(0, 0, 600, 400)
    const ctx = root.getContext('2d')!
    ctx.save()
    ctx.translate(10, 20)
    ctx.beginPath()
    ctx.roundRect(0, 0, 500, 300, 12)
    ctx.clip()
    ctx.drawImage(layer, 0, 0)
    const gradient = ctx.createLinearGradient(0, 0, 600, 0)
    gradient.addColorStop(0, '#fff')
    gradient.addColorStop(1, '#000')
    ctx.fillStyle = gradient
    ctx.font = '24px TestFont'
    ctx.fillText('中文水印', 20, 40)
    ctx.restore()
    const plan = first.record.finish(root)
    const replayed = replayRenderPlan(plan, () => { throw new Error('no external images expected') }, second.record.createSurface)
    expect(second.record.finish(replayed)).toEqual(plan)
  })
  it('rejects cyclic surfaces and unknown commands instead of dropping layers', () => {
    const { record } = recorder()
    const root = record.createSurface(10, 10)
    root.getContext('2d')!.drawImage(root, 0, 0)
    const plan = record.finish(root)
    const { record: replay } = recorder()
    expect(() => replayRenderPlan(plan, () => root, replay.createSurface)).toThrow('循环引用')
    plan.surfaces[0].commands = [{ op: 'silentlyDropWatermark', args: [] }]
    expect(() => replayRenderPlan(plan, () => root, replay.createSurface)).toThrow('不支持的绘制指令')
  })
})
