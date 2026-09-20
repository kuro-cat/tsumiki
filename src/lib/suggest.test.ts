import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggest } from './suggest.ts'

test('hot beach trip: sun items in, cold items out, quantities scale with nights', () => {
  const s = suggest({ nights: 5, climate: 'hot', kind: 'beach', activities: [] })
  const labels = s.map((x) => x.label)
  assert.ok(labels.includes('Sunscreen') && labels.includes('Swimwear') && labels.includes('Sandals'))
  assert.ok(!labels.includes('Gloves') && !labels.includes('Laptop'))
  assert.equal(s.find((x) => x.label === 'Underwear')?.qty, 6)
  assert.equal(new Set(labels).size, labels.length)
})

test('cold work trip: layers and laptop, capped quantities', () => {
  const s = suggest({ nights: 14, climate: 'cold', kind: 'city', activities: ['work'] })
  const labels = s.map((x) => x.label)
  assert.ok(labels.includes('Gloves') && labels.includes('Laptop') && labels.includes('Thermal base layers'))
  assert.equal(s.find((x) => x.label === 'Underwear')?.qty, 7)
  assert.equal(s.find((x) => x.label === 'T-shirts')?.qty, 6)
})
