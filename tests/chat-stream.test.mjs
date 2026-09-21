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
        const drain = () => { write(pending); pending = '' }
        return { push: (text) => { pending += text }, drained: async () => { drain() }, flush: drain, stop: () => {} }
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

test('server ids replace optimistic copies after a normalized answer refresh', async () => {
  const done = 'event: done\ndata: {"ok":true,"web_citations":0,"user_message_id":"saved-user","message_id":"saved-assistant"}\n\n'
  const { store } = harness([delta, done])

  await store.start(options)

  const serverMessages = [
    { id: 'saved-user', role: 'user', content: 'Help', sources: [], created_at: '' },
    { id: 'saved-assistant', role: 'assistant', content: 'Partial answer (trimmed)', sources: [], created_at: '' },
  ]

  assert.deepEqual(
    store.threadFor('thread', serverMessages).map((message) => message.id),
    ['saved-user', 'saved-assistant'],
  )
})

test('legacy done frames still deduplicate a trimmed assistant copy', async () => {
  const { store } = harness([
    'event: delta\ndata: {"delta":"Answer with trailing space \\n"}\n\n',
    'event: done\ndata: {"ok":true,"web_citations":0}\n\n',
  ])

  await store.start(options)

  const serverMessages = [
    { id: 'saved-user', role: 'user', content: 'Help', sources: [], created_at: '' },
    { id: 'saved-assistant', role: 'assistant', content: 'Answer with trailing space', sources: [], created_at: '' },
  ]

  assert.deepEqual(
    store.threadFor('thread', serverMessages).map((message) => message.id),
    ['saved-user', 'saved-assistant'],
  )
})

test('a refreshed continuation does not duplicate the prior assistant answer', async () => {
  const first = harness([
    'event: delta\ndata: {"delta":"First answer"}\n\n',
    'event: done\ndata: {"ok":true,"user_message_id":"first-user","message_id":"first-assistant"}\n\n',
  ])
  await first.store.start(options)

  const second = harness([
    'event: delta\ndata: {"delta":"Second answer"}\n\n',
    'event: done\ndata: {"ok":true,"user_message_id":"second-user","message_id":"second-assistant"}\n\n',
  ])
  // Carry the completed first turn into the same store, as the choice/intake
  // continuation path does before the conversation is fetched again.
  second.store.turns.value.thread = first.store.turnFor('thread')
  await second.store.start({ ...options, question: '[Choice Selection] Continue' })

  const serverMessages = [
    { id: 'first-user', role: 'user', content: 'Help', sources: [], created_at: '' },
    { id: 'first-assistant', role: 'assistant', content: 'First answer', sources: [], created_at: '' },
  ]

  assert.deepEqual(
    Array.from(second.store.threadFor('thread', serverMessages), (message) => String(message.content)),
    ['Help', 'First answer', '[Choice Selection] Continue', 'Second answer'],
  )
})
