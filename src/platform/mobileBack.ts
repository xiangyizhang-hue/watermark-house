/** Local overlays get first refusal before mobile navigation handles Android Back. */
const handlers: Array<() => boolean> = []

export function registerMobileBackHandler(handler: () => boolean): () => void {
  handlers.push(handler)
  return () => {
    const index = handlers.indexOf(handler)
    if (index >= 0) handlers.splice(index, 1)
  }
}

export function consumeMobileBack(): boolean {
  for (const handler of [...handlers].reverse()) if (handler()) return true
  return false
}
