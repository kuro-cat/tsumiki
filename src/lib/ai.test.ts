import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aiSetupGap, parseExtras } from './ai.ts'
import { DEFAULT_AI } from './model.ts'

test('reads the array out of prose and a code fence', () => {
  const x = parseExtras('Here you go:\n```json\n[{"label": " Tram pass ", "category": "documents", "qty": 1, "note": "Lisbon trams"}]\n```')
  assert.deepEqual(x, [{ label: 'Tram pass', category: 'documents', qty: 1, match: ['tram pass'], source: 'ai', note: 'Lisbon trams' }])
})

test('unknown categories become misc, quantities are whole and at least one, blank labels drop', () => {
  const x = parseExtras('[{"label": "Fan", "category": "cooling", "qty": 2.6}, {"label": "Hat", "qty": -3}, {"label": "  "}, {"qty": 1}]')
  assert.deepEqual(x.map((e) => [e.label, e.category, e.qty]), [['Fan', 'misc', 3], ['Hat', 'misc', 1]])
})

test('no array is an error', () => {
  assert.throws(() => parseExtras('Sorry, I cannot help.'), /did not return a list/)
})

test('setup gap: a key for both, base URL and model for OpenAI-compatible', () => {
  assert.match(aiSetupGap(DEFAULT_AI) ?? '', /API key/)
  assert.equal(aiSetupGap({ ...DEFAULT_AI, key: 'k' }), null)
  assert.match(aiSetupGap({ ...DEFAULT_AI, provider: 'openai', key: 'k' }) ?? '', /base URL/)
  assert.match(aiSetupGap({ ...DEFAULT_AI, provider: 'openai', key: 'k', baseUrl: 'https://x' }) ?? '', /model/)
})
