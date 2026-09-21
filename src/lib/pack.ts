// Axis convention: l along x, w along y (plan view), h along z (up).
export type Box = { l: number; w: number; h: number }
export type Placed = Box & { x: number; y: number; z: number }
export type Spot = { p: Placed; rot: boolean }

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

export function fits(bin: Box, placed: Placed[], p: Placed): boolean {
  if (p.x < -eps || p.y < -eps || p.z < -eps) return false
  if (p.x + p.l > bin.l + eps || p.y + p.w > bin.w + eps || p.z + p.h > bin.h + eps) return false
  return !placed.some((q) => overlaps(p, q))
}

/** Best free spot for one box in one bin: lowest resting height, then nearest the origin. Two plan rotations, upright. */
export function bestSpot(bin: Box, placed: Placed[], box: Box): Spot | null {
  let best: Spot | null = null
  const cands = [{ x: 0, y: 0 }, ...placed.flatMap((p) => [{ x: p.x + p.l, y: p.y }, { x: p.x, y: p.y + p.w }, { x: p.x, y: p.y }])]
  for (const rot of [false, true]) {
    const o = oriented(box, rot)
    if (rot && o.l === o.w) break
    for (const c of cands) {
      const z = dropZ(placed, { ...c, l: o.l, w: o.w })
      const p: Placed = { ...o, x: c.x, y: c.y, z }
      if (!fits(bin, placed, p)) continue
      if (!best || z < best.p.z || (z === best.p.z && (p.y < best.p.y || (p.y === best.p.y && p.x < best.p.x)))) best = { p, rot }
    }
  }
  return best
}

const byVolume = <K>(boxes: { key: K; box: Box }[]) => [...boxes].sort((a, b) => volume(b.box) - volume(a.box) || b.box.h - a.box.h)

/**
 * Places boxes into one bin around any already-fixed placements.
 * ponytail: extreme-point first-fit, largest volume first, two plan rotations, items kept upright;
 * swap for a real 3D bin-packing solver if fill % disappoints.
 */
export function autoPack<K>(bin: Box, boxes: { key: K; box: Box }[], fixed: Placed[] = []) {
  const placed: Placed[] = [...fixed]
  const out: (Spot & { key: K })[] = []
  const unplaced: K[] = []
  for (const { key, box } of byVolume(boxes)) {
    const s = bestSpot(bin, placed, box)
    if (s) { placed.push(s.p); out.push({ key, ...s }) } else unplaced.push(key)
  }
  return { placed: out, unplaced }
}

export const freeVolume = (bin: Box, placed: Placed[]) => volume(bin) - placed.reduce((a, p) => a + volume(p), 0)

/** Places boxes across several bins. Tightest fit wins: lowest resting height, then the bin with the least free volume. */
export function autoPackBins<K, B extends Box & { id: string }>(bins: B[], boxes: { key: K; box: Box }[], fixed: Record<string, Placed[]> = {}) {
  const placed: Record<string, Placed[]> = Object.fromEntries(bins.map((b) => [b.id, [...(fixed[b.id] ?? [])]]))
  const out: (Spot & { key: K; binId: string })[] = []
  const unplaced: K[] = []
  for (const { key, box } of byVolume(boxes)) {
    let best: { bin: B; s: Spot } | null = null
    for (const bin of bins) {
      const s = bestSpot(bin, placed[bin.id], box)
      if (!s) continue
      if (!best || s.p.z < best.s.p.z || (s.p.z === best.s.p.z && freeVolume(bin, placed[bin.id]) < freeVolume(best.bin, placed[best.bin.id]))) best = { bin, s }
    }
    if (best) { placed[best.bin.id].push(best.s.p); out.push({ key, binId: best.bin.id, ...best.s }) } else unplaced.push(key)
  }
  return { placed: out, unplaced }
}

/**
 * Height that loose volume (cm³) reaches when poured into the bin from the floor, in 1 cm layers,
 * filling only the area the rigid boxes leave free at each layer. Capped at the bin height.
 */
export function fillHeight(bin: Box, placed: Placed[], vol: number): number {
  if (vol <= 0) return 0
  const area = bin.l * bin.w
  let acc = 0
  for (let z = 0; z < bin.h - eps; z++) {
    const top = Math.min(z + 1, bin.h)
    let blocked = 0
    for (const p of placed) if (p.z < top - eps && p.z + p.h > z + eps) blocked += p.l * p.w
    const free = Math.max(0, area - blocked)
    const cap = free * (top - z)
    if (acc + cap >= vol - eps) return free > 0 ? z + (vol - acc) / free : top
    acc += cap
  }
  return bin.h
}
