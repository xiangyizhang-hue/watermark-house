// Synthetic emulator-only photo imports. No user photo is read or changed.
(async () => {
  const input = document.querySelector('input[type=file]')
  if (!input) throw new Error('Gallery import control missing')
  const transfer = new DataTransfer()
  for (const [w, h, name] of [[6000, 4000, 'acceptance-24mp.jpg'], [800, 1200, 'acceptance-portrait.jpg'], [1000, 1000, 'acceptance-square.jpg']]) {
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#2a6878'; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ebba76'; ctx.fillRect(w / 2, 0, w / 2, h)
    ctx.fillStyle = '#fff'; ctx.font = `${Math.round(w / 20)}px sans-serif`
    ctx.fillText(`${w} x ${h}`, w / 10, h / 2)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95))
    if (!blob) throw new Error('Fixture generation failed')
    transfer.items.add(new File([blob], name, { type: 'image/jpeg' }))
    canvas.width = canvas.height = 1
  }
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  return { submitted: transfer.files.length }
})()
