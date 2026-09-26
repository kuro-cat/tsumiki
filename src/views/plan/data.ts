import { useMemo } from 'react'
import { blockKey, containerFill, fillOf, isBoxed, looseVolumes, placedBoxes, type Bag, type Boxed, type Compartment, type Item, type Placement, type Trip } from '../../store'
import { oriented, type Placed } from '../../lib/pack'
import { bagContainers } from '../../lib/packing'

export const eps = 1e-6
/** Packing items, or arranging the compartments in 3D. */
export type Mode = 'pack' | 'assemble'
/** A placement with its item and its footprint as oriented. */
export type PL = { p: Placement; it: Boxed; box: Placed }
/** A compartment on the sheet, with its drawn origin in sheet pixels. */
export type CL = { c: Compartment; ox: number; oy: number }
export type Layout = { s: number; comps: CL[] }

/** Compartments take the first four block colours in order, containers the last two. */
export const compBlock = (c: Compartment, i: number) => `var(--${blockKey(c, i)})`
/** Containers wear their own item colour, softened so dark text reads on it; uncoloured ones take the last two blocks. */
const cubeBlock = (color: string | undefined, i: number) => (color ? `color-mix(in srgb, ${color} 55%, var(--paper))` : `var(--b${(i % 2) + 5})`)

/** What the plan reads about a trip's packing in the shown bag: placed boxes, soft volumes, fills, and the containers with what they hold. */
export function usePackData(trip: Trip | null, bag: Bag | null, items: Item[]) {
  const placedList = useMemo<PL[]>(
    () =>
      !trip
        ? []
        : trip.placements.flatMap((p) => {
            const it = items.find((i) => i.id === p.itemId)
            if (!it || !isBoxed(it)) return []
            return [{ p, it, box: { ...oriented(it, p.o), x: p.x, y: p.y, z: p.z } }]
          }),
    [trip, items],
  )
  const boxesBy = useMemo(() => (trip ? placedBoxes(trip, items) : {}), [trip, items])
  const looseBy = useMemo(() => (trip ? looseVolumes(trip, items) : {}), [trip, items])
  const fills = useMemo(() => Object.fromEntries((bag?.compartments ?? []).map((c) => [c.id, fillOf(c, boxesBy[c.id] ?? [], looseBy[c.id] ?? 0)])), [bag, boxesBy, looseBy])
  const containers = useMemo(() => (trip && bag ? bagContainers(trip, items, bag) : []), [trip, items, bag])
  const cubeColor = Object.fromEntries(containers.map((c, i) => [c.id, cubeBlock(c.it.color, i)]))
  const cFills = useMemo(() => Object.fromEntries(containers.map((c) => [c.id, { ...containerFill(c.it, looseBy[c.id] ?? 0), n: trip?.loose.filter((l) => l.home === c.id).length ?? 0 }])), [containers, looseBy, trip])
  return { placedList, boxesBy, looseBy, fills, containers, cubeColor, cFills }
}
export type PackData = ReturnType<typeof usePackData>

const PAD = { l: 72, r: 56, t: 96 }
const PAD_N = { l: 40, r: 24, t: 112 }
/** At or below this sheet width the pack sheet draws one compartment at a time. Matches the 600 px phone media query. */
export const NARROW = 600
const GAP = 64

/** The plan is a schedule of rooms: compartments side by side at one scale, centred on the sheet. Arranging them happens in the 3D view. */
export function planLayout(size: { W: number; H: number }, cs: Compartment[], narrow: boolean): Layout | null {
  if (!size.W || !size.H || !cs.length) return null
  const P = narrow ? PAD_N : PAD
  const aw = size.W - P.l - P.r, ah = size.H - P.t - (narrow ? 28 : 48)
  const sumL = cs.reduce((a, c) => a + c.l, 0), maxW = Math.max(...cs.map((c) => c.w))
  const s = Math.min((aw - GAP * (cs.length - 1)) / sumL, ah / maxW)
  if (!(s > 0)) return null
  let x = P.l + (aw - (sumL * s + GAP * (cs.length - 1))) / 2
  const comps: CL[] = cs.map((c) => { const cl = { c, ox: x, oy: P.t + (ah - c.w * s) / 2 }; x += c.l * s + GAP; return cl })
  return { s, comps }
}
