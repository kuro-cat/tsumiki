// Axis convention: l along x, w along y (plan view), h along z (up).
export type Box = { l: number; w: number; h: number }
export type Placed = Box & { x: number; y: number; z: number }
/** Orientation index: face = o >> 1 (0 as measured, 1 on end with l vertical, 2 on side with w vertical), turned in plan when o is odd. */
export type Spot = { p: Placed; o: number }
export const UPRIGHT = [0, 1]
export const ALL_ORIENTATIONS = [0, 1, 2, 3, 4, 5]
/** Next allowed face-down option keeping the plan turn; the same o when only one face is allowed. */
export const nextFace = (o: number, os: number[]) => { for (let k = 1; k <= 3; k++) { const n = ((o >> 1) + k) % 3 * 2 + (o & 1); if (os.includes(n)) return n } return o }
export const faceName = (o: number) => ['as measured', 'on end', 'on side'][o >> 1] + (o & 1 ? ' · turned' : '')

const eps = 1e-6
export const volume = (b: Box) => b.l * b.w * b.h
export function oriented(b: Box, o: number): Box {
  const f = o >> 1
  const d = f === 0 ? { l: b.l, w: b.w, h: b.h } : f === 1 ? { l: b.h, w: b.w, h: b.l } : { l: b.l, w: b.h, h: b.w }
  return o & 1 ? { l: d.w, w: d.l, h: d.h } : d
}

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

/** Best free spot for one box in one bin: lowest resting height, then the earliest allowed orientation (as measured before tipped), then nearest the origin,
 *  along y first (the plan's top edge), or along x first with `xFirst` (its left edge). */
export function bestSpot(bin: Box, placed: Placed[], box: Box, os: number[] = UPRIGHT, xFirst = false): Spot | null {
  let best: { p: Placed; o: number; i: number } | null = null
  const cands = [{ x: 0, y: 0 }, ...placed.flatMap((p) => [{ x: p.x + p.l, y: p.y }, { x: p.x, y: p.y + p.w }, { x: p.x, y: p.y }])]
  for (let i = 0; i < os.length; i++) {
    const o = os[i], d = oriented(box, o)
    for (const c of cands) {
      const z = dropZ(placed, { ...c, l: d.l, w: d.w })
      const p: Placed = { ...d, x: c.x, y: c.y, z }
      if (!fits(bin, placed, p)) continue
      const [a, b, ba, bb] = xFirst ? [p.x, p.y, best?.p.x, best?.p.y] : [p.y, p.x, best?.p.y, best?.p.x]
      if (!best || z < best.p.z || (z === best.p.z && (i < best.i || (i === best.i && (a < ba! || (a === ba && b < bb!)))))) best = { p, o, i }
    }
  }
  return best ? { p: best.p, o: best.o } : null
}

/** bins limits which bins a box may go in (all when absent); weight orders boxes when heavy items go low. */
type Want<K> = { key: K; box: Box; os?: number[]; weight?: number; bins?: string[] }
const byVolume = <K>(boxes: Want<K>[]) => [...boxes].sort((a, b) => volume(b.box) - volume(a.box) || b.box.h - a.box.h)
/** A plan edge of a bin: which side of a bag sits against the traveler's back. */
export type Side = 'top' | 'bottom' | 'left' | 'right'
/** Where heavy items go: low (heaviest first, so each settles as low as it can), or low and against one edge. Absent packs by size alone. */
export type Heavy = 'low' | Side

/**
 * Places boxes into one bin around any already-fixed placements.
 * ponytail: extreme-point first-fit, largest volume first, orientations as allowed per box;
 * swap for a real 3D bin-packing solver if fill % disappoints.
 */
export function autoPack<K>(bin: Box, boxes: Want<K>[], fixed: Placed[] = []) {
  const placed: Placed[] = [...fixed]
  const out: (Spot & { key: K })[] = []
  const unplaced: K[] = []
  for (const { key, box, os } of byVolume(boxes)) {
    const s = bestSpot(bin, placed, box, os)
    if (s) { placed.push(s.p); out.push({ key, ...s }) } else unplaced.push(key)
  }
  return { placed: out, unplaced }
}

export const freeVolume = (bin: Box, placed: Placed[]) => volume(bin) - placed.reduce((a, p) => a + volume(p), 0)

/** Places boxes across several bins. Tightest fit wins: lowest resting height, then the bin with the least free volume.
 *  With `heavy`, heaviest first; against the bottom or right edge the bins are packed mirrored, so bestSpot only ever leans top or left. */
export function autoPackBins<K, B extends Box & { id: string }>(bins: B[], boxes: Want<K>[], fixed: Record<string, Placed[]> = {}, heavy?: Heavy) {
  const flip = (bin: Box, p: Placed): Placed => (heavy === 'bottom' ? { ...p, y: bin.w - p.y - p.w } : heavy === 'right' ? { ...p, x: bin.l - p.x - p.l } : p)
  const placed: Record<string, Placed[]> = Object.fromEntries(bins.map((b) => [b.id, (fixed[b.id] ?? []).map((p) => flip(b, p))]))
  const out: (Spot & { key: K; binId: string })[] = []
  const unplaced: K[] = []
  const order = heavy ? [...boxes].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || volume(b.box) - volume(a.box)) : byVolume(boxes)
  for (const { key, box, os, bins: only } of order) {
    let best: { bin: B; s: Spot } | null = null
    for (const bin of bins) {
      if (only && !only.includes(bin.id)) continue
      const s = bestSpot(bin, placed[bin.id], box, os, heavy === 'left' || heavy === 'right')
      if (!s) continue
      if (!best || s.p.z < best.s.p.z || (s.p.z === best.s.p.z && freeVolume(bin, placed[bin.id]) < freeVolume(best.bin, placed[best.bin.id]))) best = { bin, s }
    }
    if (best) { placed[best.bin.id].push(best.s.p); out.push({ key, binId: best.bin.id, o: best.s.o, p: flip(best.bin, best.s.p) }) } else unplaced.push(key)
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
