import { createRenderSurface, type RenderSurfaceFactory } from './renderSurface'

export type PlanValue = string | number | boolean | null | PlanValue[] | { [key: string]: PlanValue }
export interface RenderCommand { op: string; args: PlanValue[] }
export interface PlanSurface { id: string; width: number; height: number; commands: RenderCommand[] }
export interface PlanImage { id: string; width: number; height: number; uri: string }
/** Display list, not a pixel buffer. Resource URIs must outlive the export job. */
export interface RenderPlan {
  version: 1
  colorSpace: 'srgb'
  root: string
  surfaces: PlanSurface[]
  images: PlanImage[]
}

const defaults: Record<string, PlanValue> = {
  fillStyle: '#000000', strokeStyle: '#000000', font: '10px sans-serif',
  textAlign: 'start', textBaseline: 'alphabetic', direction: 'inherit',
  globalAlpha: 1, globalCompositeOperation: 'source-over',
  lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, lineDashOffset: 0,
  shadowColor: 'rgba(0, 0, 0, 0)', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
  filter: 'none', imageSmoothingEnabled: true, imageSmoothingQuality: 'low',
  fontKerning: 'auto', letterSpacing: '0px', wordSpacing: '0px',
}
const methods = new Set([
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'arcTo', 'arc', 'ellipse',
  'bezierCurveTo', 'quadraticCurveTo', 'rect', 'roundRect', 'clip', 'fill', 'stroke',
  'fillRect', 'strokeRect', 'clearRect', 'translate', 'rotate', 'scale', 'transform',
  'setTransform', 'resetTransform', 'fillText', 'strokeText', 'setLineDash',
])

function serial(value: unknown): PlanValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value === 0 ? 0 : value
  if (Array.isArray(value)) return value.map(serial)
  throw new Error('绘制计划包含不可序列化参数')
}

/** Small text metric context only; factory never allocates output-sized pixels. */
export class RenderPlanRecorder {
  private surfaces: PlanSurface[] = []
  private images: PlanImage[] = []
  private references = new WeakMap<object, string>()
  private paints = new WeakMap<object, string>()
  private paintSequence = 0

  constructor(
    private readonly metrics: CanvasRenderingContext2D,
    private readonly resolveImage: (image: CanvasImageSource) => Omit<PlanImage, 'id'>,
  ) {}

  private imageRef(image: CanvasImageSource): string {
    const known = this.references.get(image)
    if (known) return known
    const resource = this.resolveImage(image)
    if (!resource.uri || /^(blob:|https?:)/i.test(resource.uri)) {
      throw new Error('绘制计划图片必须是持久本地资源，不能是临时或网络地址')
    }
    if (![resource.width, resource.height].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('图片资源尺寸无效')
    const id = `image-${this.images.length}`
    this.images.push({ ...resource, id })
    this.references.set(image, id)
    return id
  }

  readonly createSurface: RenderSurfaceFactory = (width, height) => {
    if (![width, height].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('绘制表面尺寸无效')
    const surface: PlanSurface = { id: `surface-${this.surfaces.length}`, width, height, commands: [] }
    this.surfaces.push(surface)
    let state = { ...defaults }
    const stack: Record<string, PlanValue>[] = []
    const emit = (op: string, args: PlanValue[] = []) => { surface.commands.push({ op, args }) }
    const canvas = { width, height } as HTMLCanvasElement
    const context = new Proxy({}, {
      get: (_target, property) => {
        const key = String(property)
        if (key === 'canvas') return canvas
        if (key in state) return state[key]
        if (key === 'save') return () => { stack.push({ ...state }); emit('save') }
        if (key === 'restore') return () => { if (stack.length) { state = stack.pop()!; emit('restore') } }
        if (key === 'measureText') return (text: string) => {
          this.metrics.save()
          try {
            for (const prop of ['font', 'textAlign', 'textBaseline', 'direction', 'fontKerning', 'letterSpacing', 'wordSpacing']) {
              if (prop in this.metrics) Reflect.set(this.metrics, prop, state[prop])
            }
            return this.metrics.measureText(text)
          } finally { this.metrics.restore() }
        }
        if (key === 'drawImage') return (image: CanvasImageSource, ...args: unknown[]) => emit('drawImage', [this.imageRef(image), ...args.map(serial)])
        if (key === 'createRadialGradient' || key === 'createLinearGradient') return (...args: unknown[]) => {
          const id = `paint-${this.paintSequence++}`
          emit(key, [id, ...args.map(serial)])
          const paint = { addColorStop: (offset: number, color: string) => emit('addColorStop', [id, serial(offset), color]) }
          this.paints.set(paint, id)
          return paint
        }
        if (key === 'createPattern') return (image: CanvasImageSource, repeat: string | null) => {
          const id = `paint-${this.paintSequence++}`
          emit(key, [id, this.imageRef(image), repeat])
          const paint = {}
          this.paints.set(paint, id)
          return paint
        }
        if (methods.has(key)) return (...args: unknown[]) => emit(key, args.map(serial))
        throw new Error(`绘制计划尚不支持 Canvas.${key}`)
      },
      set: (_target, property, value) => {
        const key = String(property)
        if (!(key in defaults)) throw new Error(`绘制计划尚不支持属性 ${key}`)
        const paint = typeof value === 'object' && value ? this.paints.get(value) : undefined
        state[key] = paint ? { paint } : serial(value)
        emit('set', [key, state[key]])
        return true
      },
    }) as CanvasRenderingContext2D
    canvas.getContext = ((kind: string) => kind === '2d' ? context : null) as unknown as HTMLCanvasElement['getContext']
    this.references.set(canvas, surface.id)
    return canvas
  }

  finish(root: HTMLCanvasElement): RenderPlan {
    const rootId = this.references.get(root)
    if (!rootId || !this.surfaces.some(surface => surface.id === rootId)) throw new Error('绘制计划根表面无效')
    // Detached snapshot: subsequent recorder mutations cannot alter an enqueued plan.
    return structuredClone({ version: 1, colorSpace: 'srgb', root: rootId, surfaces: this.surfaces, images: this.images })
  }
}

/** Browser reference executor for preview/fidelity comparisons with native replay. */
export function replayRenderPlan(
  plan: RenderPlan,
  resolveImage: (image: PlanImage) => CanvasImageSource,
  factory?: RenderSurfaceFactory,
): HTMLCanvasElement {
  if (plan.version !== 1 || plan.colorSpace !== 'srgb') throw new Error('不支持的绘制计划版本或色彩空间')
  const definitions = new Map(plan.surfaces.map(surface => [surface.id, surface]))
  const imageDefinitions = new Map(plan.images.map(image => [image.id, image]))
  if (definitions.size !== plan.surfaces.length || imageDefinitions.size !== plan.images.length ||
      plan.images.some(image => definitions.has(image.id))) throw new Error('绘制资源标识重复')
  const surfaces = new Map<string, HTMLCanvasElement>()
  const images = new Map<string, CanvasImageSource>()
  const paints = new Map<string, CanvasGradient | CanvasPattern>()
  const visiting = new Set<string>()
  const resource = (id: string): CanvasImageSource => {
    if (definitions.has(id)) return render(id)
    const known = images.get(id)
    if (known) return known
    const definition = imageDefinitions.get(id)
    if (!definition) throw new Error(`缺少绘制图片：${id}`)
    const image = resolveImage(definition)
    images.set(id, image)
    return image
  }
  const render = (id: string): HTMLCanvasElement => {
    if (visiting.has(id)) throw new Error('绘制表面存在循环引用')
    const known = surfaces.get(id)
    if (known) return known
    const definition = definitions.get(id)
    if (!definition) throw new Error(`缺少绘制表面：${id}`)
    visiting.add(id)
    const canvas = createRenderSurface(definition.width, definition.height, factory)
    const ctx = canvas.getContext('2d')!
    for (const { op, args } of definition.commands) {
      if (op === 'set') {
        const property = String(args[0])
        if (!(property in defaults)) throw new Error(`不支持的绘制属性：${property}`)
        const value = args[1]
        const paintId = value && typeof value === 'object' && !Array.isArray(value) ? value.paint : undefined
        const resolved = paintId ? paints.get(String(paintId)) : value
        if (paintId && !resolved) throw new Error(`缺少绘制颜色：${paintId}`)
        Reflect.set(ctx, property, resolved)
      } else if (op === 'drawImage') {
        Reflect.apply(ctx.drawImage, ctx, [resource(String(args[0])), ...args.slice(1)])
      } else if (op === 'createLinearGradient' || op === 'createRadialGradient') {
        const gradient = Reflect.apply(ctx[op], ctx, args.slice(1)) as CanvasGradient
        paints.set(String(args[0]), gradient)
      } else if (op === 'addColorStop') {
        const gradient = paints.get(String(args[0])) as CanvasGradient | undefined
        if (!gradient || typeof gradient.addColorStop !== 'function') throw new Error('渐变资源无效')
        gradient.addColorStop(Number(args[1]), String(args[2]))
      } else if (op === 'createPattern') {
        const pattern = ctx.createPattern(resource(String(args[1])), args[2] === null ? null : String(args[2]))
        if (!pattern) throw new Error('无法创建纹理')
        paints.set(String(args[0]), pattern)
      } else if (methods.has(op) || op === 'save' || op === 'restore') {
        const method = Reflect.get(ctx, op)
        if (typeof method !== 'function') throw new Error(`绘制执行器不支持：${op}`)
        Reflect.apply(method, ctx, args)
      } else throw new Error(`不支持的绘制指令：${op}`)
    }
    visiting.delete(id)
    surfaces.set(id, canvas)
    return canvas
  }
  return render(plan.root)
}
