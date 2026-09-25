// Native Tauri dispatch uses the Kotlin method name verbatim (no snake_case conversion).
// This structural test guards the actual Rust->Kotlin boundary, not mocked invoke calls.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('every Rust Android plugin invocation resolves to a Kotlin @Command method', () => {
  const rust = readFileSync(resolve('src-tauri/src/lib.rs'), 'utf8')
  const kotlin = readFileSync(resolve('src-tauri/gen/android/app/src/main/java/com/framelab/app/FrameLabPlugin.kt'), 'utf8')
  const calls = [...rust.matchAll(/\.run_mobile_plugin_async(?:::<[^\n]*?>)?\(\s*"([^"]+)"/g)].map(match => match[1])
  const commands = [...kotlin.matchAll(/@Command\s+fun\s+(\w+)\(/g)].map(match => match[1])
  expect(calls.length).toBeGreaterThanOrEqual(15)
  expect(calls.filter(name => !commands.includes(name))).toEqual([])
})

it('keeps database work alive across Activity recreation without retaining its context', () => {
  const kotlin = readFileSync(resolve('src-tauri/gen/android/app/src/main/java/com/framelab/app/FrameLabPlugin.kt'), 'utf8')
  expect(kotlin).toContain('hostActivity.applicationContext')
  expect(kotlin).not.toMatch(/io\.shutdown(?:Now)?\(/)
  expect(kotlin).toContain('io.execute { FrameLabMediaStream.abortAll(context) }')
})
