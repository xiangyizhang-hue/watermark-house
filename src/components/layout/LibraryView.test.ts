import { expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import LibraryView from './LibraryView.vue'
const mock = vi.hoisted(() => ({ addFiles: vi.fn(), items: [] as any[] }))
vi.mock('../../platform/env', async importOriginal => ({ ...await importOriginal<object>(), isDesktopTauri: false, isMobile: true }))
vi.mock('../../composables/useLibrary', () => ({ useLibrary: () => ({ items: mock.items, activeId: ref(null), addFiles: mock.addFiles }) }))
vi.mock('../../platform/fs', () => ({}))
it('keeps picker input and grant alive through first-photo insertion until import completes', async () => {
  mock.items = reactive([])
  let finish!: () => void
  mock.addFiles.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  const wrapper = mount(LibraryView, { global: { stubs: { GlassModal: true, PhotoCopyMenu: true, Icon: true } } })
  const input = wrapper.get('input[type=file]').element as HTMLInputElement
  const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' })
  Object.defineProperty(input, 'files', { value: [file] })
  let value = 'content://selected-photo'
  Object.defineProperty(input, 'value', { configurable: true, get: () => value, set: v => { value = v } })
  await wrapper.get('input[type=file]').trigger('change')
  expect(value).toBe('content://selected-photo')
  mock.items.push({ id: 'one', name: 'photo.jpg', width: 100, height: 100 })
  await flushPromises()
  expect(wrapper.get('input[type=file]').element).toBe(input)
  expect(wrapper.get('.lib-toolbar button').attributes('disabled')).toBeDefined()
  finish()
  await flushPromises()
  expect(value).toBe('')
  expect(mock.addFiles).toHaveBeenCalledWith([file])
  wrapper.unmount()
})
