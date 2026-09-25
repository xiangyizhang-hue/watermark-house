import { expect, it } from 'vitest'
import { consumeMobileBack, registerMobileBackHandler } from './mobileBack'
it('closes the topmost active overlay before navigation, removes unmounted handlers', () => {
  const calls: string[] = []
  const removeFirst = registerMobileBackHandler(() => { calls.push('first'); return true })
  const removeTop = registerMobileBackHandler(() => { calls.push('top'); return true })
  try {
    expect(consumeMobileBack()).toBe(true)
    expect(calls).toEqual(['top'])
    removeTop()
    expect(consumeMobileBack()).toBe(true)
    expect(calls).toEqual(['top', 'first'])
  } finally { removeTop(); removeFirst() }
  expect(consumeMobileBack()).toBe(false)
})
