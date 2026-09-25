import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
describe('personal branding and update compatibility', () => {
  it('uses the new display name without changing the installed application identity', () => {
    const config = JSON.parse(read('src-tauri/tauri.conf.json'))
    expect(config.productName).toBe('水印小屋')
    expect(config.identifier).toBe('com.framelab.app')
    expect(config.bundle.publisher).toBe('fengnan')
    expect(read('src-tauri/gen/android/app/src/main/res/values/strings.xml')).not.toContain('FrameLab')
    expect(read('src/components/mobile/MobileShell.vue')).toContain('<span>水印小屋</span>')
  })
  it('names the maintainer consistently while retaining data storage names', () => {
    expect(JSON.parse(read('package.json')).author).toBe('fengnan')
    expect(read('src-tauri/Cargo.toml')).toContain('authors = ["fengnan"]')
    expect(read('src/components/layout/PreferencesModal.vue')).toContain('作者：风喃（fengnan）')
    expect(read('src/platform/mobileAssets.ts')).toContain("'framelab-mobile-assets'")
  })
})
