import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALL_ORIENTATIONS, autoPack, autoPackBins, dropZ, fillHeight, fits, freeVolume, nextFace, oriented, type Placed } from './pack.ts'

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
  assert.equal(r.placed[0].o, 1)
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

test('oriented covers three faces and two turns', () => {
  const b = { l: 30, w: 20, h: 10 }
  assert.deepEqual(oriented(b, 0), { l: 30, w: 20, h: 10 })
  assert.deepEqual(oriented(b, 1), { l: 20, w: 30, h: 10 })
  assert.deepEqual(oriented(b, 2), { l: 10, w: 20, h: 30 })
  assert.deepEqual(oriented(b, 4), { l: 30, w: 10, h: 20 })
  assert.equal(nextFace(0, ALL_ORIENTATIONS), 2)
  assert.equal(nextFace(5, ALL_ORIENTATIONS), 1)
  assert.equal(nextFace(1, [0, 1]), 1)
})

test('a free item tips to fit a tall narrow bin; a This Side Up item does not', () => {
  const bin = { l: 10, w: 10, h: 30 }
  const box = { l: 30, w: 10, h: 10 }
  assert.deepEqual(autoPack(bin, [{ key: 'up', box }]).unplaced, ['up'])
  const r = autoPack(bin, [{ key: 'free', box, os: ALL_ORIENTATIONS }])
  assert.equal(r.unplaced.length, 0)
  assert.equal(r.placed[0].o >> 1, 1)
})

test('at equal resting height the as-measured orientation wins', () => {
  const r = autoPack({ l: 40, w: 40, h: 40 }, [{ key: 1, box: { l: 30, w: 20, h: 10 }, os: ALL_ORIENTATIONS }])
  assert.equal(r.placed[0].o, 0)
})

test('heavy items go in first and low; against an edge they lean to it', () => {
  const bin = { id: 'm', l: 20, w: 20, h: 20 }
  const boxes = [{ key: 'light', box: { l: 20, w: 20, h: 10 }, weight: 100 }, { key: 'heavy', box: { l: 20, w: 20, h: 5 }, weight: 900 }]
  const z = (r: ReturnType<typeof autoPackBins<string, typeof bin>>, k: string) => r.placed.find((x) => x.key === k)!.p.z
  // by size the bigger, lighter box goes first and ends up underneath
  assert.equal(z(autoPackBins([bin], boxes), 'heavy'), 10)
  assert.equal(z(autoPackBins([bin], boxes, {}, 'low'), 'heavy'), 0)
  const small = [{ key: 'a', box: { l: 5, w: 5, h: 5 }, weight: 500 }]
  const at = (heavy: Parameters<typeof autoPackBins>[3]) => { const p = autoPackBins([bin], small, {}, heavy).placed[0].p; return [p.x, p.y] }
  assert.deepEqual(at('top'), [0, 0])
  assert.deepEqual(at('bottom'), [0, 15])
  assert.deepEqual(at('right'), [15, 0])
  // mirrored packing still works around what is already there
  const fixed = { m: [{ l: 20, w: 5, h: 20, x: 0, y: 15, z: 0 }] }
  assert.deepEqual(autoPackBins([bin], small, fixed, 'bottom').placed[0].p.y, 10)
})

test('a box goes only in the bins it may use', () => {
  const bins = [{ id: 'sleeve', l: 30, w: 20, h: 3 }, { id: 'main', l: 50, w: 30, h: 20 }]
  const thin = { l: 20, w: 4, h: 3 }
  assert.equal(autoPackBins(bins, [{ key: 'a', box: thin }]).placed[0].binId, 'sleeve')
  assert.equal(autoPackBins(bins, [{ key: 'a', box: thin, bins: ['main'] }]).placed[0].binId, 'main')
  assert.deepEqual(autoPackBins(bins, [{ key: 'a', box: thin, bins: [] }]).unplaced, ['a'])
})
