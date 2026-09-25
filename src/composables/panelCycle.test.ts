import { expect, it } from 'vitest'
import { useAppState } from './useAppState'
it('cycles side panels, bottom panel, then restores all', () => {
  const app=useAppState()
  app.cyclePanels()
  expect([app.state.leftOpen,app.state.rightOpen,app.state.filmstripVisible]).toEqual([false,false,true])
  app.cyclePanels()
  expect([app.state.leftOpen,app.state.rightOpen,app.state.filmstripVisible]).toEqual([true,true,false])
  app.cyclePanels()
  expect([app.state.leftOpen,app.state.rightOpen,app.state.filmstripVisible]).toEqual([true,true,true])
})
