import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { ref, computed } from 'vue'

// Execute the real store with transport and UI dependencies replaced, not a copy of its logic.
function harness(chunks, failure) {
  const requests = []
  const source = readFileSync(new URL('../app/stores/chatStream.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  const dependencies = {
    pinia: { defineStore: (_, setup) => setup },
    '~/lib/http': { authHeaders: async (headers) => headers },
    '~/stores/billing': { upgradeMessage: () => null },
    '~/stores/todos': { useTodoStore: () => ({ fetchTodos: async () => {} }) },
    '~/stores/advisories': { useAdvisoryStore: () => ({ fetchAdvisories: async () => {} }) },
    '~/composables/useLetterDraftPanel': { useLetterDraftPanel: () => ({}) },
    '~/composables/useTextStreamer': {
      createTextStreamer: (write) => {
        let pending = ''
        return { push: (text) => { pending += text }, flush: () => { write(pending); pending = '' }, stop: () => {} }
      },
    },
  }
  vm.runInNewContext(compiled, {
    exports, require: (id) => { assert.ok(id in dependencies, id); return dependencies[id] },
    ref, computed, crypto: globalThis.crypto, AbortController, TextDecoder,
    useRuntimeConfig: () => ({ public: { apiBase: 'http://test' } }),
    fetch: async (_, options) => {
      requests.push(JSON.parse(options.body))
      let index = 0
      return { ok: true, body: { getReader: () => ({ read: async () => {
        if (index < chunks.length) return { value: new TextEncoder().encode(chunks[index++]), done: false }
        if (failure) throw new Error(failure)
        return { done: true }
      } }) } }
    },
  })
  return { store: exports.useChatStreamStore(), requests }
}

const options = { conversationId: 'thread', question: 'Help', returnTo: '/chat' }
const delta = 'event: delta\ndata: {"delta":"Partial answer"}\n\n'

for (const [name, ending, failure] of [
  ['premature EOF', '', undefined],
  ['network failure', '', 'Connection reset'],
  ['server error', 'event: error\ndata: {"message":"Provider failed"}\n\n', undefined],
  ['unsuccessful done', 'event: done\ndata: {"ok":false}\n\n', undefined],
]) {
  test(`${name} preserves partial text through settle`, async () => {
    const { store } = harness([delta, ending], failure)
    await store.start(options)
    assert.ok(store.turnFor('thread').error)
    store.settle('thread')
    assert.equal(store.turnFor('thread').assistantMessage.content, 'Partial answer')
  })
}

test('successful completion can settle', async () => {
  const { store } = harness([delta, 'event: done\ndata: {"ok":true}\n\n'])
  await store.start(options)
  assert.equal(store.turnFor('thread').error, '')
  store.settle('thread')
  assert.equal(store.turnFor('thread'), null)
})

test('CRLF frames split across network chunks complete successfully', async () => {
  const { store } = harness(['event: delta\r', '\ndata: {"delta":"Kept"}\r\n\r', '\nevent: done\r\ndata: {"ok":true}\r\n\r\n'])
  await store.start(options)
  assert.equal(store.turnFor('thread').assistantMessage.content, 'Kept')
  assert.equal(store.turnFor('thread').completed, true)
})

test('retry retains attachments and the previous partial answer', async () => {
  const { store, requests } = harness([delta])
  await store.start({ ...options, attachments: [{ id: 'document' }] })
  await store.retry('thread')
  assert.deepEqual(requests[1].attachment_ids, ['document'])
  assert.ok(store.turnFor('thread').priorMessages.some((message) => message.content === 'Partial answer'))
})
