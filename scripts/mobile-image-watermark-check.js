(async () => {
  // Synthetic transparent PNG fixture; never reads or changes user originals.
  const input = document.querySelector('.image-watermark-panel input[type=file]')
  if (!input) throw Error('Open the image watermark panel first')
  const fixture = document.createElement('canvas'); fixture.width = 160; fixture.height = 80
  const ctx = fixture.getContext('2d'); ctx.fillStyle = '#ff0000'; ctx.fillRect(40,20,80,40)
  const blob = await new Promise(resolve => fixture.toBlob(resolve, 'image/png'))
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'transparent-test.png', {type:'image/png'}))
  input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles:true}))
  await new Promise(resolve => setTimeout(resolve, 500))
  const color = document.querySelector('.image-watermark-panel input[type=color]')
  if (!color) throw Error('Image import failed')
  color.value = '#00ff00'; color.dispatchEvent(new Event('input', {bubbles:true}))
  await new Promise(resolve => setTimeout(resolve, 250))
  const canvas = document.querySelector('.effect-overlay')
  const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data
  let green = 0, transparent = 0, red = 0
  for (let i=0; i<pixels.length; i+=4) {
    if (pixels[i+3] === 0) transparent++
    if (pixels[i+1]>240 && pixels[i]<10 && pixels[i+3]>240) green++
    if (pixels[i]>240 && pixels[i+1]<10 && pixels[i+3]>240) red++
  }
  if (!green || red || !transparent) throw Error(JSON.stringify({green,red,transparent}))
  return {green,red,transparent,inputCleared:input.value === '',passed:true}
})()
