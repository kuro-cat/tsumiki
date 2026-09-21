import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoPack, autoPackBins, dropZ, fillHeight, fits, freeVolume, type Placed } from './pack.ts'

const cube = { l: 10, w: 10, h: 10 }

test('four cubes tile a 20×20 floor without stacking', () => {
  const r = autoPack({ l: 20, w: 20, h: 10 }, [1, 2, 3, 4].map((k) => ({ key: k, box: cube })))
  assert.equal(r.unplaced.length, 0)
  assert.ok(r.placed.every((x) => x.p.z === 0))
  const keys = new Set(r.placed.map((x) => `${x.p.x},${x.p.y}`))
  assert.equal(keys.size, 4)
})

test('fifth cube stacks when there is headroom, else is unplaced', () => {
  const boxes = [1, 2, 3, 4, 5].map((k) => ({ key: k, box: cube }))
  const tall = autoPack({ l: 20, w: 20, h: 20 }, boxes)
  assert.equal(tall.unplaced.length, 0)
  assert.equal(tall.placed.filter((x) => x.p.z === 10).length, 1)
  const flat = autoPack({ l: 20, w: 20, h: 10 }, boxes)
  assert.deepEqual(flat.unplaced, [5])
})

test('rotation is tried when the upright orientation does not fit', () => {
  const r = autoPack({ l: 10, w: 30, h: 10 }, [{ key: 'a', box: { l: 30, w: 10, h: 10 } }])
  assert.equal(r.unplaced.length, 0)
  assert.equal(r.placed[0].rot, true)
})

test('dropZ settles on the highest overlapping top and fits rejects overlaps', () => {
  const placed: Placed[] = [{ x: 0, y: 0, z: 0, l: 10, w: 10, h: 5 }]
  assert.equal(dropZ(placed, { x: 5, y: 5, l: 10, w: 10 }), 5)
  assert.equal(dropZ(placed, { x: 10, y: 0, l: 10, w: 10 }), 0)
  assert.equal(fits({ l: 20, w: 20, h: 20 }, placed, { x: 5, y: 5, z: 0, l: 10, w: 10, h: 5 }), false)
  assert.equal(fits({ l: 20, w: 20, h: 20 }, placed, { x: 5, y: 5, z: 5, l: 10, w: 10, h: 5 }), true)
  assert.equal(fits({ l: 20, w: 20, h: 8 }, placed, { x: 5, y: 5, z: 5, l: 10, w: 10, h: 5 }), false)
})

test('autoPackBins sends a small box to the tighter bin at equal resting height', () => {
  const bins = [{ id: 'main', l: 40, w: 30, h: 20 }, { id: 'sleeve', l: 32, w: 24, h: 3 }]
  const r = autoPackBins(bins, [{ key: 'laptop', box: { l: 31, w: 22, h: 2 } }, { key: 'shoes', box: { l: 30, w: 20, h: 12 } }])
  assert.equal(r.unplaced.length, 0)
  assert.equal(r.placed.find((x) => x.key === 'laptop')?.binId, 'sleeve')
  assert.equal(r.placed.find((x) => x.key === 'shoes')?.binId, 'main')
})

test('autoPackBins prefers the lower resting height over the tighter bin', () => {
  const bins = [{ id: 'a', l: 10, w: 10, h: 30 }, { id: 'b', l: 20, w: 20, h: 30 }]
  const r = autoPackBins(bins, [{ key: 1, box: cube }], { a: [{ x: 0, y: 0, z: 0, l: 10, w: 10, h: 10 }] })
  assert.equal(r.placed[0].binId, 'b')
  assert.equal(r.placed[0].p.z, 0)
})

test('fillHeight pours around rigid boxes and caps at the lid', () => {
  const bin = { l: 10, w: 10, h: 10 }
  assert.equal(fillHeight(bin, [], 0), 0)
  assert.equal(fillHeight(bin, [], 250), 2.5)
  // a 5×10 block 4 cm tall leaves 50 cm² per layer for 4 layers (200 cm³), then 100 cm² above it
  const block: Placed[] = [{ x: 0, y: 0, z: 0, l: 5, w: 10, h: 4 }]
  assert.equal(fillHeight(bin, block, 200), 4)
  assert.equal(fillHeight(bin, block, 250), 4.5)
  assert.equal(fillHeight(bin, block, 5000), 10)
  assert.equal(freeVolume(bin, block), 800)
})
