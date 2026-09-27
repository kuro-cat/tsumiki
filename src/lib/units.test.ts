import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtDim, fmtW, fromShown, shownMin, shownUnit, toShown } from './units.ts'

test('metric shows what is stored', () => {
  assert.equal(fmtDim({ l: 50, w: 32.5, h: 20 }, 'metric'), '50 × 32.5 × 20')
  assert.equal(fmtW(850, 'metric'), '850 g')
  assert.equal(fmtW(12345, 'metric'), '12.35 kg')
  assert.equal(toShown(31.242, 'cm', 'metric'), 31.242)
  assert.equal(shownUnit('kg', 'metric'), 'kg')
})

test('imperial shows inches to one decimal, oz under a pound and lb from there', () => {
  assert.equal(fmtDim({ l: 50, w: 30.48, h: 2.54 }, 'imperial'), '19.7 × 12 × 1')
  assert.equal(fmtW(100, 'imperial'), '3.5 oz')
  assert.equal(fmtW(453.59237, 'imperial'), '1.00 lb')
  assert.equal(fmtW(-2000, 'imperial'), '-4.41 lb')
  assert.deepEqual(['cm', 'g', 'kg', 'L', '%'].map((u) => shownUnit(u, 'imperial')), ['in', 'oz', 'lb', 'L', '%'])
  assert.equal(toShown(2, 'L', 'imperial'), 2)
})

test('a value typed in imperial reads back as typed', () => {
  for (const [v, unit] of [[12.3, 'cm'], [0.2, 'cm'], [5.51, 'kg'], [3.5, 'g'], [22.05, 'kg']] as const) {
    assert.equal(toShown(fromShown(v, unit, 'imperial'), unit, 'imperial'), v)
  }
})

test('a shown minimum never falls below the metric one', () => {
  assert.equal(shownMin(0.5, 'cm', 'imperial'), 0.2)
  assert.equal(shownMin(1, 'g', 'imperial'), 0.1)
  assert.equal(shownMin(0, 'kg', 'imperial'), 0)
  assert.equal(shownMin(2.54, 'cm', 'imperial'), 1)
})
