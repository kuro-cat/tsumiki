import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoPackInto, fitOne, looseInBag, moveInto, noFitReason, unitsToPack } from './packing.ts'
import type { Bag, CheckItem, ContainerItem, Item, RigidItem, SoftItem, Trip } from './model.ts'

const rigid = (id: string, l: number, w: number, h: number, qty = 1): RigidItem => ({ id, name: id, category: 'gear', kind: 'rigid', l, w, h, up: false, weight: 100, qty })
const soft = (id: string, litres: number, qty = 1): SoftItem => ({ id, name: id, category: 'clothing', kind: 'soft', volume: litres, packsTo: 100, weight: 100, qty })
const cube = (id: string, capacity: number): ContainerItem => ({ id, name: id, category: 'gear', kind: 'container', l: 20, w: 10, h: 10, up: false, capacity, weight: 100, qty: 1 })
const bag = (id: string, l: number, w: number, h: number): Bag => ({ id, name: id, empty: 0, limit: null, compartments: [{ id: `${id}-main`, name: 'Main', l, w, h, x: 0, y: 0, z: 0 }] })
const trip = (over: Partial<Trip> = {}): Trip => ({ id: 't', name: '', destination: '', start: '2026-01-01', end: '2026-01-03', climate: 'mild', kind: 'city', activities: [], bagIds: ['b'], checklist: [], placements: [], loose: [], worn: [], ...over })
const entry = (id: string, qty: number, itemIds: string[]): CheckItem => ({ id, label: id, category: 'gear', qty, match: [], itemIds, packed: false, source: 'manual' })

test('fitOne places a unit in the corner, beside what is there, or nowhere', () => {
  const b = bag('b', 30, 20, 10)
  const first = fitOne(b.compartments, rigid('a', 10, 10, 10))
  assert.deepEqual(first && [first.itemId, first.compartmentId, first.x, first.y, first.z], ['a', 'b-main', 0, 0, 0])
  const taken = { 'b-main': [{ l: 10, w: 20, h: 10, x: 0, y: 0, z: 0 }] }
  assert.equal(fitOne(b.compartments, rigid('a', 10, 10, 10), taken)?.x, 10)
  assert.equal(fitOne(b.compartments, rigid('big', 40, 30, 30)), null)
})

test('noFitReason tells too big from no room left, and names a bag that could take it', () => {
  const small = bag('Daypack', 20, 20, 10), big = bag('Suitcase', 60, 40, 30)
  assert.equal(noFitReason(small, [big], rigid('Laptop', 31, 22, 2), {}), 'Laptop (31 × 22 × 2 cm) is bigger than every compartment in Daypack. It fits in Suitcase.')
  const full = { 'Daypack-main': [{ l: 20, w: 20, h: 10, x: 0, y: 0, z: 0 }] }
  assert.equal(noFitReason(small, [], rigid('Book', 10, 10, 2), full), 'Book (10 × 10 × 2 cm) has no gap big enough left.')
})

test('looseInBag fills a packing cube with room before the compartment', () => {
  const b = bag('b', 50, 30, 20), k = cube('k', 2), shirt = soft('shirt', 1)
  const t = trip({ placements: [{ id: 'pk', itemId: 'k', compartmentId: 'b-main', x: 0, y: 0, z: 0, o: 0 }] })
  assert.equal(looseInBag(t, [k, shirt], b, shirt).home, 'pk')
  const full = { ...t, loose: [{ id: 'l1', itemId: 'shirt', home: 'pk' }, { id: 'l2', itemId: 'shirt', home: 'pk' }] }
  assert.equal(looseInBag(full, [k, shirt], b, shirt).home, 'b-main')
})

test('unitsToPack takes each entry’s shortfall, never more than is owned', () => {
  const socks = rigid('socks', 5, 5, 5, 2)
  // the list wants 3, only 2 are owned
  assert.deepEqual(unitsToPack(trip({ checklist: [entry('e', 3, ['socks'])] }), [socks]).map((i) => i.id), ['socks', 'socks'])
  // one pair is already in a bag
  const packed = trip({ checklist: [entry('e', 2, ['socks'])], placements: [{ id: 'p', itemId: 'socks', compartmentId: 'c', x: 0, y: 0, z: 0, o: 0 }] })
  assert.deepEqual(unitsToPack(packed, [socks]).map((i) => i.id), ['socks'])
})

test('unitsToPack takes linked items in link order and shares units between entries', () => {
  const a = rigid('a', 5, 5, 5), b = rigid('b', 5, 5, 5, 2)
  assert.deepEqual(unitsToPack(trip({ checklist: [entry('e', 2, ['a', 'b'])] }), [a, b]).map((i) => i.id), ['a', 'b'])
  // two entries asking for the same item don't draw more than it has
  assert.deepEqual(unitsToPack(trip({ checklist: [entry('e1', 2, ['b']), entry('e2', 2, ['b'])] }), [a, b]).map((i) => i.id), ['b', 'b'])
})

test('unitsToPack with nothing linked packs every unpacked unit, by name', () => {
  const items: Item[] = [rigid('zip', 5, 5, 5), soft('apron', 1, 2)]
  assert.deepEqual(unitsToPack(trip(), items).map((i) => i.id), ['apron', 'apron', 'zip'])
})

test('autoPackInto places boxes first, fills a cube packed in the same run, and counts what did not fit', () => {
  const b = bag('b', 30, 20, 10), k = cube('k', 1.5), shirt = soft('shirt', 1), huge = rigid('huge', 50, 50, 50)
  const r = autoPackInto(trip(), [k, shirt, huge], b, [shirt, k, huge, shirt])
  assert.deepEqual(r.placements.map((p) => p.itemId), ['k'])
  assert.equal(r.unplaced, 1)
  // the first shirt goes into the cube it arrived with; the cube has no room for a second
  const cubeId = r.placements[0].id
  assert.deepEqual(r.loose.map((l) => l.home), [cubeId, 'b-main'])
})

test('moveInto takes a placed unit to another bag under the same id, so a cube keeps what it holds', () => {
  const k = cube('k', 2), shirt = soft('shirt', 1), to = bag('b', 30, 20, 10)
  const t = trip({ bagIds: ['a', 'b'], placements: [{ id: 'pk', itemId: 'k', compartmentId: 'a-main', x: 5, y: 5, z: 0, o: 0 }], loose: [{ id: 'l', itemId: 'shirt', home: 'pk' }] })
  const moved = moveInto(t, [k, shirt], 'pk', to)
  assert.deepEqual(moved && [moved.id, moved.itemId, moved.compartmentId, moved.x, moved.y], ['pk', 'k', 'b-main', 0, 0])
  // nothing moves when it won't fit
  assert.equal(moveInto(t, [k, shirt], 'pk', bag('tiny', 5, 5, 5)), null)
})

test('autoPackInto keeps each unit to compartments that take its category', () => {
  const b: Bag = { ...bag('b', 50, 30, 20), compartments: [{ id: 'main', name: 'Main', l: 50, w: 30, h: 20, x: 0, y: 0, z: 0 }, { id: 'sleeve', name: 'Sleeve', l: 36, w: 26, h: 3, x: 0, y: 0, z: 0, takes: ['electronics'] }] }
  const brush: RigidItem = { ...rigid('brush', 20, 4, 3), category: 'toiletries' }, laptop: RigidItem = { ...rigid('laptop', 31, 22, 2), category: 'electronics' }
  const r = autoPackInto(trip(), [brush, laptop], b, [brush, laptop])
  assert.deepEqual(Object.fromEntries(r.placements.map((p) => [p.itemId, p.compartmentId])), { brush: 'main', laptop: 'sleeve' })
  // a soft unit goes where it's taken even when another compartment has more room
  const big: Bag = { ...b, compartments: [b.compartments[0], { ...b.compartments[1], l: 60, w: 40, h: 30, takes: ['toiletries'] }] }
  assert.equal(autoPackInto(trip(), [soft('shirt', 1)], big, [soft('shirt', 1)]).loose[0].home, 'main')
})
