// CDP-only emulator acceptance fixture; never included in the app bundle.
(async () => {
  const invoke = window.__TAURI__.core.invoke
  const existing = await invoke('mobile_load_local_record', { key: 'export-job' })
  if (existing) throw new Error('Refusing to replace an existing export job')
  const assets = JSON.parse(await invoke('mobile_assets', { operation: 'list', payload: '{}' }))
  const photo = assets.find(item => item.name === 'offline-landscape.jpg')
  if (!photo) throw new Error('Synthetic acceptance photo missing')
  const history = JSON.parse(await invoke('mobile_history', { operation: 'list', payload: JSON.stringify({ photoId: photo.id }) }))
  const state = history.sort((a, b) => b.seq - a.seq)[0]?.state
  if (!state) throw new Error('Synthetic photo history missing')
  window.__retryCheckValidConfig = structuredClone(state)
  const invalid = structuredClone(state)
  invalid.photoCrop = { x: 0, y: 0, w: 0, h: 1 }
  const job = { version: 1, jobId: 'acceptance-retry-' + Date.now(), status: 'paused', ids: [photo.id], cursor: 0,
    format: 'jpg', jpgQuality: 0.95, supersample: 1, backfillExif: false, rulesEnabled: false, rulesText: '',
    baseConfig: invalid, configs: { [photo.id]: invalid }, completed: {}, updatedAt: Date.now() }
  const serialized = JSON.stringify(job)
  await invoke('mobile_save_local_record', { key: 'export-job', value: serialized, version: 1 })
  localStorage.setItem('framelab-mobile-export-job-v1', serialized)
  return { seeded: true, id: photo.id }
})()
