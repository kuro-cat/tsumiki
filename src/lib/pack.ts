// Axis convention: l along x, w along y (plan view), h along z (up).
export type Box = { l: number; w: number; h: number }
export type Placed = Box & { x: number; y: number; z: number }

const eps = 1e-6
export const volume = (b: Box) => b.l * b.w * b.h
export const oriented = (b: Box, rot: boolean): Box => (rot ? { l: b.w, w: b.l, h: b.h } : { l: b.l, w: b.w, h: b.h })

const footprintOverlaps = (a: { x: number; y: number; l: number; w: number }, b: { x: number; y: number; l: number; w: number }) =>
  a.x + eps < b.x + b.l && b.x + eps < a.x + a.l && a.y + eps < b.y + b.w && b.y + eps < a.y + a.w

const overlaps = (a: Placed, b: Placed) => footprintOverlaps(a, b) && a.z + eps < b.z + b.h && b.z + eps < a.z + a.h

/** Height an item settles at when dropped on this footprint: top of the highest item under it, else the floor. */
export function dropZ(placed: Placed[], fp: { x: number; y: number; l: number; w: number }): number {
  let z = 0
  for (const p of placed) if (footprintOverlaps(p, fp)) z = Math.max(z, p.z + p.h)
  return z
}

export function fits(bag: Box, placed: Placed[], p: Placed): boolean {
  if (p.x < -eps || p.y < -eps || p.z < -eps) return false
  if (p.x + p.l > bag.l + eps || p.y + p.w > bag.w + eps || p.z + p.h > bag.h + eps) return false
  return !placed.some((q) => overlaps(p, q))
}

/**
 * Places boxes into the bag around any already-fixed placements.
 * ponytail: extreme-point first-fit, largest volume first, two plan rotations, items kept upright;
 * swap for a real 3D bin-packing solver if fill % disappoints.
 */
export function autoPack<K>(bag: Box, boxes: { key: K; box: Box }[], fixed: Placed[] = []) {
  const placed: Placed[] = [...fixed]
  const out: { key: K; p: Placed; rot: boolean }[] = []
  const unplaced: K[] = []
  const order = [...boxes].sort((a, b) => volume(b.box) - volume(a.box) || b.box.h - a.box.h)
  for (const { key, box } of order) {
    let best: { p: Placed; rot: boolean } | null = null
    const cands = [{ x: 0, y: 0 }, ...placed.flatMap((p) => [{ x: p.x + p.l, y: p.y }, { x: p.x, y: p.y + p.w }, { x: p.x, y: p.y }])]
    for (const rot of [false, true]) {
      const o = oriented(box, rot)
      if (rot && o.l === o.w) break
      for (const c of cands) {
        const z = dropZ(placed, { ...c, l: o.l, w: o.w })
        const p: Placed = { ...o, x: c.x, y: c.y, z }
        if (!fits(bag, placed, p)) continue
        if (!best || z < best.p.z || (z === best.p.z && (p.y < best.p.y || (p.y === best.p.y && p.x < best.p.x)))) best = { p, rot }
      }
    }
    if (best) {
      placed.push(best.p)
      out.push({ key, ...best })
    } else unplaced.push(key)
  }
  return { placed: out, unplaced }
}
