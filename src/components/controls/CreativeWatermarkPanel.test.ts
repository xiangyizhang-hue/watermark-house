import { mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import Panel from './CreativeWatermarkPanel.vue'
import { useFrameConfig } from '../../composables/useFrameConfig'
beforeEach(() => { useFrameConfig().reset(); localStorage.clear() })
it('quick editor opens, updates all text without selecting elements, and closes', async () => {
  const show = vi.fn(function(this: HTMLDialogElement) { this.setAttribute('open', '') })
  const close = vi.fn(function(this: HTMLDialogElement) { this.removeAttribute('open') })
  HTMLDialogElement.prototype.showModal = show
  HTMLDialogElement.prototype.close = close
  const wrapper = mount(Panel)
  const click = async (label: string) => wrapper.findAll('button').find(b => b.text() === label)!.trigger('click')
  await click('参考原版')
  await click('文字快捷编辑')
  expect(show).toHaveBeenCalled()
  const fields = wrapper.findAll('dialog textarea')
  expect(fields).toHaveLength(3)
  await fields[0]!.setValue('上下同名')
  await fields[1]!.setValue('新作品')
  const elements = useFrameConfig().state.creativeWatermark!.elements
  expect(elements[0]!.text).toBe('上下同名')
  expect(elements[5]!.text).toBe('上下同名')
  expect(elements[2]!.text).toBe('新作品')
  await wrapper.findAll('select')[1]!.setValue('right')
  expect(elements[0]!.x).toBe(50) // immutable updates preserve the earlier snapshot
  expect(useFrameConfig().state.creativeWatermark!.elements[0]!.x).toBe(95)
  expect(useFrameConfig().state.creativeWatermark!.elements[5]!.x).toBe(95)
  await click('完成')
  expect(close).toHaveBeenCalled()
  wrapper.unmount()
})
it('edits text and numeric positions, saves and restores user watermark', async () => {
  const wrapper = mount(Panel)
  const click = async (label: string) => { await wrapper.findAll('button').find(b => b.text() === label)!.trigger('click') }
  await click('参考原版')
  await wrapper.get('textarea').setValue('我的工作室')
  await wrapper.findAll('input[type=number]')[0]!.setValue('42')
  expect(useFrameConfig().state.creativeWatermark!.elements[0]!.text).toBe('我的工作室')
  expect(useFrameConfig().state.creativeWatermark!.elements[0]!.x).toBe(42)
  await click('保存我的水印')
  await wrapper.get('textarea').setValue('临时')
  await click('载入我的水印')
  expect(wrapper.get('textarea').element.value).toBe('我的工作室')
  await click('加横线')
  expect(useFrameConfig().state.creativeWatermark!.elements).toHaveLength(7)
  await click('删除此元素')
  expect(useFrameConfig().state.creativeWatermark!.elements).toHaveLength(6)
})
it('restores original ratio from erroneous border without deleting watermark', async () => {
  const { patch, state } = useFrameConfig()
  patch({ frameRatio: 1.5, padding: 30 })
  const wrapper = mount(Panel)
  await wrapper.findAll('button').find(b => b.text() === '参考原版')!.trigger('click')
  await wrapper.findAll('button').find(b => b.text().startsWith('恢复原图比例'))!.trigger('click')
  expect(state.frameRatio).toBeNull(); expect(state.padding).toBe(0)
  expect(state.creativeWatermark!.enabled).toBe(true)
})
