/** Per-render allocation strategy; never global mutable state across async exports. */
export type RenderSurfaceFactory = (width: number, height: number) => HTMLCanvasElement
const factories = new WeakMap<object, RenderSurfaceFactory>()

export function createRenderSurface(width: number, height: number, factory?: RenderSurfaceFactory): HTMLCanvasElement {
  const surface = factory ? factory(width, height) : document.createElement('canvas')
  if (!factory) {
    surface.width = width
    surface.height = height
  }
  const context = surface.getContext('2d')
  if (!context) throw new Error('无法获取绘制上下文')
  if (factory) factories.set(context, factory)
  return surface
}

export function renderSurfaceFactory(context: CanvasRenderingContext2D): RenderSurfaceFactory | undefined {
  return factories.get(context)
}
