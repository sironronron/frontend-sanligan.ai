import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

test('the real text streamer drains in animation frames instead of flushing on completion', async () => {
  const source = readFileSync(new URL('../app/composables/useTextStreamer.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  const exports = {}
  const callbacks = new Map()
  let nextFrame = 0
  const requestAnimationFrame = (callback) => {
    const id = ++nextFrame
    callbacks.set(id, callback)
    return id
  }
  const cancelAnimationFrame = (id) => callbacks.delete(id)
  const window = {
    requestAnimationFrame,
    cancelAnimationFrame,
    matchMedia: () => ({ matches: false }),
  }

  vm.runInNewContext(compiled, {
    exports,
    window,
    requestAnimationFrame,
    cancelAnimationFrame,
  })

  const chunks = []
  const streamer = exports.createTextStreamer((chunk) => chunks.push(chunk))
  streamer.push('A streamed answer')

  // The first delta is queued, so the successful done frame cannot make the
  // whole answer appear synchronously.
  assert.deepEqual(chunks, [])
  const drained = streamer.drained()
  let guard = 0
  while (callbacks.size > 0 && guard++ < 100) {
    const [id, callback] = callbacks.entries().next().value
    callbacks.delete(id)
    callback()
  }
  await drained

  assert.equal(chunks.join(''), 'A streamed answer')
  assert.ok(chunks.length > 1)
})

test('a large provider delta is not revealed in one animation frame', async () => {
  const source = readFileSync(new URL('../app/composables/useTextStreamer.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  const exports = {}
  const callbacks = new Map()
  let nextFrame = 0
  const requestAnimationFrame = (callback) => {
    const id = ++nextFrame
    callbacks.set(id, callback)
    return id
  }
  const cancelAnimationFrame = (id) => callbacks.delete(id)
  const window = {
    requestAnimationFrame,
    cancelAnimationFrame,
    matchMedia: () => ({ matches: false }),
  }

  vm.runInNewContext(compiled, {
    exports,
    window,
    requestAnimationFrame,
    cancelAnimationFrame,
  })

  const chunks = []
  const streamer = exports.createTextStreamer((chunk) => chunks.push(chunk))
  streamer.push('x'.repeat(200))

  const [id, callback] = callbacks.entries().next().value
  callbacks.delete(id)
  callback()

  assert.ok(chunks[0].length < 200)

  const drained = streamer.drained()
  let guard = 0
  while (callbacks.size > 0 && guard++ < 1000) {
    const [nextId, nextCallback] = callbacks.entries().next().value
    callbacks.delete(nextId)
    nextCallback()
  }
  await drained

  assert.equal(chunks.join(''), 'x'.repeat(200))
  assert.ok(chunks.length > 10)
})
