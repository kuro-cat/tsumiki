import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bagTotals, defaultCapacity, defaultKind, dropBag, fillOf, packedCount, packedVolume, repack, wornWeight, roomiestHome, rotateCompartment, tripReady, withoutPlacements, type Bag, type ContainerItem, type Item, type Trip } from './model.ts'

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
  const trip: Trip = { id: 't', name: '', destination: '', start: '2026-01-01', end: '2026-01-02', climate: 'mild', kind: 'city', activities: [], bagIds: ['b'], checklist: [], loose: [], worn: [], placements: [{ id: 'p', itemId: 'i', compartmentId: 'c', x: 20, y: 16, z: 0, o: 0 }] }
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

test('roomiestHome fills a container with room before the compartment', () => {
  const bag: Bag = { id: 'b', name: 'B', empty: 0, limit: null, compartments: [{ id: 'c', name: 'Main', l: 50, w: 30, h: 20, x: 0, y: 0, z: 0 }] }
  const cube: ContainerItem = { id: 'k', name: 'Cube', category: 'gear', kind: 'container', l: 30, w: 20, h: 10, up: false, capacity: 5, weight: 100, qty: 1 }
  const containers = [{ id: 'p1', it: cube }]
  assert.equal(roomiestHome(bag, containers, {}, {}, 1000), 'p1')
  assert.equal(roomiestHome(bag, containers, {}, { p1: 4500 }, 1000), 'c')
})

test('removing a container placement removes what it holds', () => {
  const trip: Trip = { id: 't', name: '', destination: '', start: '2026-01-01', end: '2026-01-02', climate: 'mild', kind: 'city', activities: [], bagIds: ['b'], checklist: [], worn: [],
    placements: [{ id: 'p1', itemId: 'k', compartmentId: 'c', x: 0, y: 0, z: 0, o: 0 }, { id: 'p2', itemId: 'r', compartmentId: 'c', x: 30, y: 0, z: 0, o: 0 }],
    loose: [{ id: 'l1', itemId: 's', home: 'p1' }, { id: 'l2', itemId: 's', home: 'c' }] }
  const r = withoutPlacements(trip, new Set(['p1']))
  assert.deepEqual(r.placements.map((p) => p.id), ['p2'])
  assert.deepEqual(r.loose.map((l) => l.id), ['l2'])
})

test('defaultCapacity is 90 % of the outer box in litres', () => {
  assert.equal(defaultCapacity({ l: 30, w: 20, h: 10 }), 5.4)
})

test('repack moves one bag’s packing into another and leaves other bags alone', () => {
  const box: Item = { id: 'r', name: 'Box', category: 'gear', kind: 'rigid', l: 10, w: 10, h: 10, up: false, weight: 100, qty: 1 }
  const shirt: Item = { id: 's', name: 'Shirt', category: 'clothing', kind: 'soft', volume: 1, packsTo: 100, weight: 100, qty: 1 }
  const a: Bag = { id: 'a', name: 'A', empty: 0, limit: null, compartments: [{ id: 'ca', name: 'Main', l: 20, w: 20, h: 20, x: 0, y: 0, z: 0 }] }
  const b: Bag = { id: 'b', name: 'B', empty: 0, limit: null, compartments: [{ id: 'cb', name: 'Main', l: 20, w: 20, h: 20, x: 0, y: 0, z: 0 }] }
  const c: Bag = { id: 'c', name: 'C', empty: 0, limit: null, compartments: [{ id: 'cc', name: 'Main', l: 5, w: 5, h: 5, x: 0, y: 0, z: 0 }] }
  const trip: Trip = { id: 't', name: '', destination: '', start: '2026-01-01', end: '2026-01-02', climate: 'mild', kind: 'city', activities: [], bagIds: ['a', 'b'], checklist: [], worn: [],
    placements: [{ id: 'p1', itemId: 'r', compartmentId: 'ca', x: 0, y: 0, z: 0, o: 0 }, { id: 'p2', itemId: 'r', compartmentId: 'cb', x: 0, y: 0, z: 0, o: 0 }],
    loose: [{ id: 'l1', itemId: 's', home: 'ca' }, { id: 'l2', itemId: 's', home: 'cb' }] }
  const items = [box, shirt]
  const moved = repack(a, c, trip, items)
  assert.deepEqual(moved.placements.map((p) => p.compartmentId), ['cb']) // the 10 cm box does not fit a 5 cm bag
  assert.deepEqual(moved.loose.map((l) => l.home), ['cb', 'cc']) // soft item pours into the new bag, other bag untouched
  const dropped = dropBag(a, trip)
  assert.deepEqual(dropped.placements.map((p) => p.id), ['p2'])
  assert.deepEqual(dropped.loose.map((l) => l.id), ['l2'])
  assert.equal(tripReady(trip, [a, b], items), false) // empty checklist is never ready
})

test('worn units count as packed and weigh nothing in any bag', () => {
  const hat: Item = { id: 'h', name: 'Hat', category: 'clothing', kind: 'rigid', l: 30, w: 30, h: 8, up: false, weight: 110, qty: 1 }
  const bag: Bag = { id: 'b', name: 'B', empty: 500, limit: null, compartments: [{ id: 'c', name: 'Main', l: 40, w: 40, h: 20, x: 0, y: 0, z: 0 }] }
  const trip: Trip = { id: 't', name: '', destination: '', start: '2026-01-01', end: '2026-01-02', climate: 'mild', kind: 'city', activities: [], bagIds: ['b'],
    checklist: [{ id: 'k', label: 'Hat', category: 'clothing', qty: 1, match: ['hat'], packed: false, source: 'rule' }], placements: [], loose: [], worn: [{ id: 'w', itemId: 'h' }] }
  assert.equal(packedCount(trip, 'h'), 1)
  assert.equal(wornWeight(trip, [hat]), 110)
  assert.equal(bagTotals(bag, trip, [hat]).total, 500)
  assert.equal(tripReady(trip, [bag], [hat]), true)
})
