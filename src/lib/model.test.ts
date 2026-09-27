import { test } from 'node:test'
import assert from 'node:assert/strict'
import { afterBagEdit, bagLeaves, duplicateTrip,withoutItem, bagTotals, settleCompartments, sharedTotals, entryUnits, isPacked, linkedItems, withLink, defaultCapacity, defaultKind, dropBag, fillOf, packedCount, packedVolume, repack, wornWeight, roomiestHome, rotateCompartment, tripReady, withoutPlacements, type Bag, type ContainerItem, type Item, type Trip } from './model.ts'

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

test('a trip is ready only with the checklist packed, every limit kept and nothing over volume', () => {
  const box: Item = { id: 'r', name: 'Box', category: 'gear', kind: 'rigid', l: 10, w: 10, h: 10, up: false, weight: 1000, qty: 1 }
  const shirt: Item = { id: 's', name: 'Shirt', category: 'clothing', kind: 'soft', volume: 1, packsTo: 100, weight: 100, qty: 1 }
  const items = [box, shirt]
  const a: Bag = { id: 'a', name: 'A', empty: 500, limit: 2000, compartments: [{ id: 'ca', name: 'Main', l: 20, w: 20, h: 20, x: 0, y: 0, z: 0 }] }
  const b: Bag = { id: 'b', name: 'B', empty: 500, limit: null, compartments: [{ id: 'cb', name: 'Main', l: 10, w: 10, h: 10, x: 0, y: 0, z: 0 }] }
  const trip: Trip = { id: 't', name: '', destination: '', start: '2026-01-01', end: '2026-01-02', climate: 'mild', kind: 'city', activities: [], bagIds: ['a', 'b'], worn: [],
    checklist: [{ id: 'k1', label: 'Box', category: 'gear', qty: 1, match: [], itemIds: ['r'], packed: false, source: 'rule' }, { id: 'k2', label: 'Shirt', category: 'clothing', qty: 1, match: [], itemIds: ['s'], packed: false, source: 'rule' }],
    placements: [{ id: 'p', itemId: 'r', compartmentId: 'ca', x: 0, y: 0, z: 0, o: 0 }], loose: [{ id: 'l', itemId: 's', home: 'cb' }] }
  assert.equal(tripReady(trip, [a, b], items), true)
  assert.equal(tripReady({ ...trip, loose: [] }, [a, b], items), false) // shirt not packed
  assert.equal(tripReady(trip, [{ ...a, limit: 1200 }, b], items), false) // A over its own limit
  assert.equal(tripReady({ ...trip, shared: [{ id: 'x', bagIds: ['a', 'b'], limit: 2000 }] }, [a, b], items), false) // 1500 + 600 over the shared 2000
  assert.equal(tripReady({ ...trip, weighed: { a: 2100 } }, [a, b], items), false) // the Actual Weight is what counts
  assert.equal(tripReady(trip, [a, { ...b, compartments: [{ ...b.compartments[0], h: 1 }] }], items), false) // 1 L shirt in a 0.1 L compartment
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

test('checklist entries link by keyword until pinned, and pack by quantity', () => {
  const socks: Item = { id: 's', name: 'Socks, pair', category: 'clothing', kind: 'soft', volume: 0.3, packsTo: 60, weight: 60, qty: 6 }
  const shoes: Item = { id: 'k', name: 'Sneakers, pair', category: 'footwear', kind: 'rigid', l: 30, w: 20, h: 12, up: false, weight: 700, qty: 1 }
  const items = [socks, shoes]
  const raw = { label: 'Socks', category: 'clothing' as const, qty: 4, match: ['sock'], source: 'rule' as const }
  const c = { ...withLink(raw, items), id: 'c', packed: false }
  assert.deepEqual(c.itemIds, ['s'])
  const trip: Trip = { id: 't', name: '', destination: '', start: '2026-01-01', end: '2026-01-02', climate: 'mild', kind: 'city', activities: [], bagIds: [], checklist: [c],
    placements: [], loose: [1, 2, 3].map((n) => ({ id: `l${n}`, itemId: 's', home: 'x' })), worn: [] }
  assert.equal(entryUnits(c, trip, items), 3)
  assert.equal(isPacked(c, trip, items), false)
  assert.equal(isPacked(c, { ...trip, worn: [{ id: 'w', itemId: 's' }] }, items), true)
  // an unpinned entry with no keyword hit keeps guessing: a later item with a matching name links itself
  const pair = { ...withLink({ label: 'Pair of anything', category: 'misc' as const, qty: 1, match: ['pair'], source: 'manual' as const }, []), id: 'p', packed: false }
  assert.equal(pair.itemIds, undefined)
  assert.deepEqual(linkedItems(pair, items).map((i) => i.id), ['s', 'k'])
  // pinned to none is not in inventory even though keywords would match
  assert.deepEqual(linkedItems({ ...pair, itemIds: [] }, items), [])
})

test('a weighed bag is judged on its Actual Weight, a Shared Limit on the sum of Totals', () => {
  const book: Item = { id: 'i', name: 'Book', category: 'misc', kind: 'rigid', l: 10, w: 10, h: 2, up: false, weight: 500, qty: 1 }
  const comp = (id: string) => ({ id, name: 'Main', l: 30, w: 20, h: 10, x: 0, y: 0, z: 0 })
  const a: Bag = { id: 'a', name: 'A', empty: 1000, limit: 2000, compartments: [comp('ca')] }
  const b: Bag = { id: 'b', name: 'B', empty: 800, limit: null, compartments: [comp('cb')] }
  const base: Trip = { id: 't', name: '', destination: '', start: '2026-01-01', end: '2026-01-02', climate: 'mild', kind: 'city', activities: [], bagIds: ['a', 'b'], checklist: [{ id: 'e', label: 'Book', category: 'misc', qty: 1, match: [], itemIds: ['i'], packed: false, source: 'manual' }], loose: [], worn: [], placements: [{ id: 'p', itemId: 'i', compartmentId: 'ca', x: 0, y: 0, z: 0, o: 0 }] }
  // unweighed: the Estimate is the Total
  const est = bagTotals(a, base, [book])
  assert.deepEqual([est.estimate, est.actual, est.total, est.margin], [1500, null, 1500, 500])
  // weighed: the Actual Weight replaces it, the Estimate stays for comparison
  const trip: Trip = { ...base, weighed: { a: 2100 }, shared: [{ id: 's', bagIds: ['a', 'b'], limit: 3000 }] }
  const w = bagTotals(a, trip, [book])
  assert.deepEqual([w.estimate, w.total, w.margin, w.wState], [1500, 2100, -100, 'over'])
  assert.equal(tripReady(trip, [a, b], [book]), false)
  // the Shared Limit sums the weighed A and the estimated B: 2100 + 800
  assert.deepEqual(sharedTotals(trip, [a, b], [book]).map((s) => [s.total, s.over]), [[2900, false]])
  const light: Trip = { ...trip, weighed: { a: 1900 } }
  assert.equal(tripReady(light, [a, b], [book]), true)
  assert.equal(tripReady({ ...light, shared: [{ id: 's', bagIds: ['a', 'b'], limit: 2500 }] }, [a, b], [book]), false)
})

test('a bag leaving a trip takes its Actual Weight and its place in a Shared Limit with it', () => {
  const trip = { weighed: { a: 2100, b: 900 }, shared: [{ id: 's', bagIds: ['a', 'b'], limit: 3000 }] } as Trip
  // swapped: the new bag starts unweighed but takes the old bag's place in the Shared Limit
  assert.deepEqual(bagLeaves(trip, 'a', 'c'), { weighed: { b: 900 }, shared: [{ id: 's', bagIds: ['c', 'b'], limit: 3000 }] })
  // removed: a Shared Limit left with one bag is gone
  assert.deepEqual(bagLeaves(trip, 'a'), { weighed: { b: 900 }, shared: [] })
  // trips from before weighing existed have neither field
  assert.deepEqual(bagLeaves({} as Trip, 'a'), { weighed: {}, shared: [] })
})

test('a bag counts a container by its box, not its box plus what is inside', () => {
  const cube: ContainerItem = { id: 'k', name: 'Cube', category: 'gear', kind: 'container', l: 10, w: 10, h: 10, up: false, capacity: 0.9, weight: 100, qty: 1 }
  const shirt: Item = { id: 's', name: 'Shirt', category: 'clothing', kind: 'soft', volume: 1, packsTo: 50, weight: 150, qty: 1 }
  const bag: Bag = { id: 'b', name: 'B', empty: 0, limit: null, compartments: [{ id: 'c', name: 'Main', l: 20, w: 10, h: 10, x: 0, y: 0, z: 0 }] }
  const trip = { bagIds: ['b'], placements: [{ id: 'p', itemId: 'k', compartmentId: 'c', x: 0, y: 0, z: 0, o: 0 }], loose: [{ id: 'l1', itemId: 's', home: 'p' }], worn: [], checklist: [] } as unknown as Trip
  // 2 L bag, 1 L cube: half full whether or not the cube holds a shirt; the shirt still weighs
  assert.equal(bagTotals(bag, trip, [cube, shirt]).fill, 0.5)
  assert.equal(bagTotals(bag, trip, [cube, shirt]).itemsW, 250)
  // a shirt loose in the compartment does take room
  assert.equal(bagTotals(bag, { ...trip, loose: [{ id: 'l2', itemId: 's', home: 'c' }] }, [cube, shirt]).fill, 0.75)
})

test('compartments settle: nothing floats once what held it up has moved', () => {
  const comp = (id: string, x: number, y: number, z: number, l: number, w: number, h: number) => ({ id, name: id, x, y, z, l, w, h })
  // Main was resting on the sleeve (z 3); the sleeve slides out from under it
  const [main, sleeve] = settleCompartments([comp('main', 0, 0, 3, 50, 32, 20), comp('sleeve', 60, 0, 0, 36, 26, 3)])
  assert.equal(main.z, 0)
  assert.equal(sleeve.z, 0)
  // raise the sleeve above Main and put it over Main: it stacks on Main's top
  const [m2, s2] = settleCompartments([comp('main', 0, 0, 0, 50, 32, 20), comp('sleeve', 5, 5, 30, 36, 26, 3)])
  assert.deepEqual([m2.z, s2.z], [0, 20])
  // dragged past the corner, the assembly shifts back so nothing sits at a negative offset
  const [a, b] = settleCompartments([comp('a', -6, 4, 0, 10, 10, 10), comp('b', 30, -2, 0, 10, 10, 10)])
  assert.deepEqual([a.x, a.y, b.x, b.y], [0, 6, 36, 0])
})

const tripOf = (over: Partial<Trip>): Trip => ({ id: 't', name: '', destination: '', start: '2026-01-01', end: '2026-01-02', climate: 'mild', kind: 'city', activities: [], bagIds: [], checklist: [], placements: [], loose: [], worn: [], ...over })
const comp = (id: string) => ({ id, name: id, l: 30, w: 20, h: 10, x: 0, y: 0, z: 0 })

test('editing a bag leaves the trip’s other bags alone', () => {
  const a: Bag = { id: 'a', name: 'A', empty: 0, limit: null, compartments: [comp('a1')] }
  const t = tripOf({ bagIds: ['a', 'b'], placements: [{ id: 'pa', itemId: 'i', compartmentId: 'a1', x: 0, y: 0, z: 0, o: 0 }, { id: 'pb', itemId: 'i', compartmentId: 'b1', x: 0, y: 0, z: 0, o: 0 }], loose: [{ id: 'lb', itemId: 's', home: 'b1' }] })
  const r = afterBagEdit(t, a, { ...a, name: 'A renamed' }, [])
  assert.deepEqual(r.placements.map((p) => p.id), ['pa', 'pb'])
  assert.deepEqual(r.loose, t.loose)
})

test('a compartment removed from a bag takes its placements out and sends its loose units to Main', () => {
  const before: Bag = { id: 'a', name: 'A', empty: 0, limit: null, compartments: [comp('main'), comp('pocket')] }
  const after: Bag = { ...before, compartments: [comp('main')] }
  const t = tripOf({
    bagIds: ['a'],
    placements: [{ id: 'cube', itemId: 'k', compartmentId: 'pocket', x: 0, y: 0, z: 0, o: 0 }, { id: 'stays', itemId: 'i', compartmentId: 'main', x: 0, y: 0, z: 0, o: 0 }],
    loose: [{ id: 'in-cube', itemId: 's', home: 'cube' }, { id: 'in-pocket', itemId: 's', home: 'pocket' }, { id: 'in-main', itemId: 's', home: 'main' }],
  })
  const r = afterBagEdit(t, before, after, [])
  assert.deepEqual(r.placements.map((p) => p.id), ['stays'])
  // the cube's contents leave with it; what lay loose in the pocket moves to Main
  assert.deepEqual(r.loose.map((l) => [l.id, l.home]), [['in-pocket', 'main'], ['in-main', 'main']])
  // a trip without the bag is untouched
  const other = tripOf({ bagIds: ['z'], placements: t.placements })
  assert.equal(afterBagEdit(other, before, after, []), other)
})

test('withoutItem removes every unit of an item from a trip and unlinks it from the checklist', () => {
  const entry = (id: string, itemIds: string[]) => ({ id, label: id, category: 'gear' as const, qty: 1, match: [id], itemIds, packed: false, source: 'manual' as const })
  const t = tripOf({
    placements: [{ id: 'pk', itemId: 'cube', compartmentId: 'c', x: 0, y: 0, z: 0, o: 0 }, { id: 'px', itemId: 'x', compartmentId: 'c', x: 0, y: 0, z: 0, o: 0 }],
    loose: [{ id: 'l1', itemId: 'shirt', home: 'pk' }, { id: 'l2', itemId: 'cube', home: 'c' }, { id: 'l3', itemId: 'shirt', home: 'c' }],
    worn: [{ id: 'w1', itemId: 'cube' }, { id: 'w2', itemId: 'x' }],
    checklist: [entry('both', ['cube', 'x']), entry('only', ['cube']), entry('other', ['x'])],
  })
  const r = withoutItem(t, 'cube')
  assert.deepEqual(r.placements.map((p) => p.id), ['px'])
  // the shirt that was in the cube goes with it; the loose one stays
  assert.deepEqual(r.loose.map((l) => l.id), ['l3'])
  assert.deepEqual(r.worn.map((w) => w.id), ['w2'])
  assert.deepEqual(r.checklist.map((c) => c.itemIds), [['x'], undefined, ['x']])
})

test('a compartment made smaller re-seats what no longer fits, and takes out what has no room left', () => {
  const box = (id: string, l: number, w: number, h: number): Item => ({ id, name: id, category: 'gear', kind: 'rigid', l, w, h, up: true, weight: 1, qty: 1 })
  const items = [box('a', 10, 10, 10), box('b', 10, 10, 10), box('c', 10, 10, 10)]
  const before: Bag = { id: 'bag', name: 'B', empty: 0, limit: null, compartments: [{ ...comp('main'), l: 30, w: 10, h: 10 }] }
  const at = (id: string, itemId: string, x: number) => ({ id, itemId, compartmentId: 'main', x, y: 0, z: 0, o: 0 })
  const t = tripOf({ bagIds: ['bag'], placements: [at('pa', 'a', 0), at('pb', 'b', 20)] })
  // 30 long becomes 20: b at x 20 now overhangs and moves into the free spot at x 10, keeping its id
  const r = afterBagEdit(t, before, { ...before, compartments: [{ ...before.compartments[0], l: 20 }] }, items)
  assert.deepEqual(r.placements.map((p) => [p.id, p.x]), [['pa', 0], ['pb', 10]])
  // three items and room for two: the one that overhangs comes out
  const full = tripOf({ bagIds: ['bag'], placements: [at('pa', 'a', 0), at('pc', 'c', 10), at('pb', 'b', 20)] })
  assert.deepEqual(afterBagEdit(full, before, { ...before, compartments: [{ ...before.compartments[0], l: 20 }] }, items).placements.map((p) => p.id), ['pa', 'pc'])
})

test('a duplicated trip copies bags, checklist and packing under new ids, without hand ticks or Actual Weights', () => {
  const t = tripOf({ name: 'Oslo', start: '2026-01-01', end: '2026-01-05', climate: 'cold', activities: ['hiking'], bagIds: ['b', 'd'], sample: true,
    checklist: [{ id: 'e', label: 'Jacket', category: 'clothing', qty: 2, match: ['jacket'], itemIds: ['s'], packed: true, source: 'rule' }],
    placements: [{ id: 'p1', itemId: 'k', compartmentId: 'c', x: 0, y: 0, z: 0, o: 0 }],
    loose: [{ id: 'l1', itemId: 's', home: 'p1' }, { id: 'l2', itemId: 's', home: 'c' }], worn: [{ id: 'w', itemId: 'h' }],
    weighed: { b: 9000 }, shared: [{ id: 'sh', bagIds: ['b', 'd'], limit: 12000 }] })
  const c = duplicateTrip(t, new Date(2026, 2, 1, 12))
  assert.equal(c.name, 'Oslo copy')
  // four nights, starting a week from today
  assert.deepEqual([c.start, c.end], ['2026-03-08', '2026-03-12'])
  assert.deepEqual([c.bagIds, c.climate, c.activities, c.sample, c.weighed], [['b', 'd'], 'cold', ['hiking'], undefined, undefined])
  const ids = [c.id, c.checklist[0].id, c.placements[0].id, ...c.loose.map((l) => l.id), c.worn[0].id, c.shared![0].id]
  assert.ok(ids.every((id) => !['t', 'e', 'p1', 'l1', 'l2', 'w', 'sh'].includes(id)))
  assert.deepEqual([c.checklist[0].packed, c.checklist[0].itemIds, c.checklist[0].qty], [false, ['s'], 2])
  // the soft unit in the cube follows the cube's new placement
  assert.deepEqual(c.loose.map((l) => l.home), [c.placements[0].id, 'c'])
  assert.deepEqual([c.shared![0].bagIds, c.shared![0].limit], [['b', 'd'], 12000])
  assert.equal(packedCount(c, 's'), 2)
})
