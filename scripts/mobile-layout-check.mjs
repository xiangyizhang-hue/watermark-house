// UI acceptance against the running Android debug WebView. No application data writes.
const port = process.env.FRAME_CDP_PORT || '9223'
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = targets.find(t => t.type === 'page')
if (!page) throw Error('No debug WebView')
const ws = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map(); let seq = 0
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id) } }
await new Promise(r => { ws.onopen = r })
const send = (method, params = {}) => new Promise(resolve => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({id,method,params})) })
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true})
  if (r.result.exceptionDetails) throw Error(JSON.stringify(r.result.exceptionDetails))
  return r.result.result.value
}
const settle = () => new Promise(r => setTimeout(r, 180))
const click = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`); await settle() }
const results = []
const watchdog = setTimeout(() => { console.error('UI acceptance timeout'); process.exit(1) }, 50000)
try {
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  for (const width of [360,375,393,430]) {
    await send('Emulation.setDeviceMetricsOverride', {width,height:840,deviceScaleFactor:1,mobile:true})
    await click('.mobile-quick-close'); await click('.mobile-sheet-close'); await click('.tp-close'); await click('.pref-close')
    for (const [name, selector] of [['editor',null],['watermark','.mobile-editor-tools button:nth-child(1)'],['image-watermark','.mobile-editor-tools button:nth-child(2)'],['templates','.mobile-editor-tools button:nth-child(5)']]) {
      if (selector) await click(selector)
      results.push(await evaluate(`(() => {
        const roots = ['.mobile-shell','.mobile-sheet','.mobile-quick-sheet','.tp-modal'];
        const overflow = roots.flatMap(s => [...document.querySelectorAll(s)]).filter(e => {const r=e.getBoundingClientRect(); return r.width>0 && (r.left < -1 || r.right > innerWidth+1 || e.scrollWidth > e.clientWidth+2)}).map(e=>e.className);
        return {width:innerWidth,page:${JSON.stringify(name)},overflow,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
      })()`))
      await click('.mobile-sheet-close'); await click('.mobile-quick-close'); await click('.tp-close')
    }
  }
  console.log(JSON.stringify(results,null,2))
  if (results.some(r => r.overflow.length)) process.exitCode = 1
} finally {
  await send('Emulation.clearDeviceMetricsOverride')
  await send('Emulation.setEmulatedMedia', {features:[]})
  clearTimeout(watchdog); ws.close()
}
