import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { ref, computed } from 'vue'

// One corpus, three consumers. The Python encoder and the Laravel relay are
// held to the same JSON by their own suites; this one proves the browser
// parser agrees on raw bytes, CRLF, arbitrary chunk boundaries, malformed
// frames, failed tools, and both failure shapes.
const corpus = JSON.parse(
  readFileSync(new URL('./fixtures/sse-corpus.json', import.meta.url), 'utf8'),
)

// Execute the real store with transport and UI dependencies replaced, not a
// copy of its logic.
function harness(chunks, failure) {
  const requests = []
  const panelCalls = []
  const panel = {
    letterDraft: ref(null),
    beginLetterDraft: () => panelCalls.push('begin'),
    closeLetterDraft: () => panelCalls.push('close'),
    fillLetterDraft: (draft) => panelCalls.push(draft),
  }
  const source = readFileSync(new URL('../app/stores/chatStream.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  const dependencies = {
    pinia: { defineStore: (_, setup) => setup },
    '~/lib/http': { authHeaders: async (headers) => headers },
    '~/stores/billing': { upgradeMessage: () => null },
    '~/stores/todos': { useTodoStore: () => ({ fetchTodos: async () => {} }) },
    '~/stores/advisories': { useAdvisoryStore: () => ({ fetchAdvisories: async () => {} }) },
    '~/composables/useLetterDraftPanel': { useLetterDraftPanel: () => panel },
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
  return { store: exports.useChatStreamStore(), requests, panelCalls, panel }
}

function receiptsOf(turn) {
  return Object.fromEntries(turn.receipts.map((receipt) => [receipt.kind, receipt.count]))
}

function assertCase(testCase) {
  test(`wire contract: ${testCase.id}`, async () => {
    const { store } = harness(testCase.chunks, testCase.failure)
    await store.start({ conversationId: 'thread', question: 'Help', returnTo: '/chat' })

    const turn = store.turnFor('thread')
    const message = turn.assistantMessage
    const expected = testCase.expected

    if ('text' in expected) assert.equal(message?.content ?? '', expected.text, 'text')
    if ('completed' in expected) assert.equal(turn.completed, expected.completed, 'completed')
    if ('error' in expected) assert.equal(turn.error, expected.error, 'error')
    if ('errorContains' in expected) assert.ok(turn.error.includes(expected.errorContains), `error: ${turn.error}`)
    if ('errorPresent' in expected) assert.ok(turn.error.length > 0, 'error must be set')
    if ('receipts' in expected) assert.deepEqual(receiptsOf(turn), expected.receipts)
    if ('sourceUrls' in expected) {
      const urls = [...message.sources.filter((source) => source.type === 'web').map((source) => source.url)]
      assert.deepEqual(urls, expected.sourceUrls)
    }
    if ('noticeKinds' in expected) assert.deepEqual([...turn.notices.map((notice) => notice.kind)], expected.noticeKinds)
    if ('awaitingIntake' in expected) assert.equal(turn.awaitingIntake, expected.awaitingIntake)
    if ('intakeFieldCount' in expected) assert.equal(turn.intakeFields?.length ?? 0, expected.intakeFieldCount)
    if ('letterTitle' in expected) assert.equal(turn.letterDraft?.title ?? null, expected.letterTitle)
  })
}

for (const testCase of corpus.wire_cases) assertCase(testCase)

test('the corpus pins every case the audit calls out', () => {
  assert.deepEqual(
    corpus.wire_cases.map((testCase) => testCase.id).sort(),
    [
      'arbitrary-byte-boundaries',
      'citation-becomes-a-source',
      'crlf-split-across-chunks',
      'happy-path-with-receipt',
      'intake-form-awaits-input',
      'letter-draft-opens-the-editor',
      'malformed-frame-is-ignored',
      'network-failure-reports-transport-error',
      'notice-is-deduplicated',
      'premature-eof-keeps-partial',
      'provider-error-after-partial',
      'unsuccessful-done-keeps-partial',
      'zero-count-result-is-not-a-receipt',
    ],
  )
})
