import { beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Workspace from './Workspace.vue'
import { useViewer } from '../../composables/useViewer'
vi.mock('../preview/FrameContainer.vue', () => ({default:{template:'<div class="frame-container" />'}}))
beforeEach(() => { useViewer().resetView() })
it('zooms around fresh clicked coordinates and immediately resets on the next double click', async () => {
  const wrapper = mount(Workspace,{props:{photoSrc:null,bgImage:null}})
  const wrap = wrapper.get('.fit-wrap').element
  vi.spyOn(wrap,'getBoundingClientRect').mockReturnValue({left:200,top:100,width:600,height:400} as DOMRect)
  await wrapper.get('.stage').trigger('dblclick',{clientX:450,clientY:220})
  const viewer = useViewer()
  expect(viewer.zoom.value).toBe(2)
  expect(viewer.panX.value).toBe(-250)
  expect(viewer.panY.value).toBe(-120)
  await wrapper.get('.stage').trigger('dblclick',{clientX:450,clientY:220})
  expect(viewer.zoom.value).toBe(1)
  expect(viewer.panX.value).toBe(0)
  await wrapper.get('.stage').trigger('dblclick',{clientX:450,clientY:220})
  expect(viewer.zoom.value).toBe(2)
  wrapper.unmount()
})
it('first returns a displaced or zoomed-out photo to fit', async () => {
  const wrapper = mount(Workspace,{props:{photoSrc:null,bgImage:null}})
  const viewer = useViewer(); viewer.setPan(40,20); viewer.setZoom(0.5)
  await wrapper.get('.stage').trigger('dblclick',{clientX:400,clientY:200})
  expect(viewer.zoom.value).toBe(1); expect(viewer.panX.value).toBe(0)
  wrapper.unmount()
})
