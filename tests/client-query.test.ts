import assert from 'node:assert/strict'
import test from 'node:test'
import { buildClientQuery } from '../app/utils/clientQuery.ts'

test('serializes archive filters as Laravel boolean values', () => {
  assert.deepEqual(Object.fromEntries(new URLSearchParams(buildClientQuery({ archived: false }))), {
    archived: '0',
  })
  assert.deepEqual(Object.fromEntries(new URLSearchParams(buildClientQuery({ archived: true }))), {
    archived: '1',
  })
})

test('preserves non-empty filters and omits empty filters', () => {
  assert.deepEqual(Object.fromEntries(new URLSearchParams(buildClientQuery({
    q: 'Ada Lovelace',
    client_type: 'person',
    lifecycle: 'active',
    owner_id: '42',
    archived: undefined,
    page: 2,
    per_page: 50,
  }))), {
    q: 'Ada Lovelace',
    client_type: 'person',
    lifecycle: 'active',
    owner_id: '42',
    page: '2',
    per_page: '50',
  })
  assert.equal(buildClientQuery({ q: '', archived: null }), '')
})
