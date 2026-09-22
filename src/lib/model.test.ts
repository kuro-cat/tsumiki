import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultKind, fillOf, packedVolume, rotateCompartment, type Bag, type Item, type Trip } from './model.ts'

test('kind defaults to soft for clothing and rigid otherwise', () => {
  assert.equal(defaultKind('clothing'), 'soft')
  assert.equal(defaultKind('footwear'), 'rigid')
  assert.equal(defaultKind('gear'), 'rigid')
})

test('packed volume is litres × packs-to, in cm³', () => {
  assert.equal(packedVolume({ id: 'a', name: 'Shirt', category: 'clothing', kind: 'soft', volume: 2, packsTo: 60, weight: 100, qty: 1 }), 1200)
})

test('rotating a compartment carries its placements round with it', () => {
  const item: Item = { id: 'i', name: 'Box', category: 'gear', kind: 'rigid', l: 10, w: 4, h: 2, up: false, weight: 1, qty: 1 }
  const bag: Bag = { id: 'b', name: 'B', empty: 0, limit: null, compartments: [{ id: 'c', name: 'Main', l: 30, w: 20, h: 10, x: 0, y: 0, z: 0 }] }
  const trip: Trip = { id: 't', name: '', destination: '', start: '2026-01-01', end: '2026-01-02', climate: 'mild', kind: 'city', activities: [], bagId: 'b', checklist: [], loose: [], placements: [{ id: 'p', itemId: 'i', compartmentId: 'c', x: 20, y: 16, z: 0, o: 0 }] }
  const r = rotateCompartment(bag, 'c', [trip], [item])
  assert.deepEqual([r.bag.compartments[0].l, r.bag.compartments[0].w], [20, 30])
  const p = r.trips[0].placements[0]
  // footprint was 10×4 at (20,16): right-bottom corner. Turned 90°, it is 4×10 at (0,20): left-bottom corner, still inside 20×30.
  assert.deepEqual([p.x, p.y, p.o], [0, 20, 1])
  assert.ok(p.x + 4 <= 20 && p.y + 10 <= 30)
})

test('fillOf reports over volume without refusing', () => {
  const f = fillOf({ l: 10, w: 10, h: 10 }, [], 1200)
  assert.equal(f.height, 10)
  assert.equal(f.over, true)
  assert.equal(Math.round(f.ratio * 100), 120)
})
