import { autoPackBins, fillHeight, freeVolume, oriented, volume, type Box, type Placed } from './pack.ts'

export type Category = 'clothing' | 'footwear' | 'toiletries' | 'electronics' | 'documents' | 'gear' | 'misc'
export const CATEGORIES: Category[] = ['clothing', 'footwear', 'toiletries', 'electronics', 'documents', 'gear', 'misc']
export type Kind = 'rigid' | 'soft'
/** color is an optional hex; undefined draws the item in paper. */
type ItemBase = { id: string; name: string; category: Category; weight: number; qty: number; color?: string; sample?: boolean }
/** Keeps its shape: a box that occupies exactly its L × W × H. */
export type RigidItem = ItemBase & { kind: 'rigid'; l: number; w: number; h: number }
/** No fixed shape: a measured volume in litres that packs to a percentage of itself. It has a home, never a position. */
export type SoftItem = ItemBase & { kind: 'soft'; volume: number; packsTo: number }
export type Item = RigidItem | SoftItem
/** One box-shaped space inside a bag. x, y, z is where the traveler assembled it relative to the bag; Main is first. */
export type Compartment = { id: string; name: string; l: number; w: number; h: number; x: number; y: number; z: number }
export type Bag = { id: string; name: string; empty: number; limit: number | null; compartments: Compartment[]; sample?: boolean }
export type Placement = { id: string; itemId: string; compartmentId: string; x: number; y: number; z: number; rot: boolean }
/** A soft item's home on a trip: one entry per unit, no position. */
export type Loose = { id: string; itemId: string; compartmentId: string }
export type Climate = 'hot' | 'mild' | 'cold' | 'mixed'
export const CLIMATES: Climate[] = ['hot', 'mild', 'cold', 'mixed']
export type TripKind = 'city' | 'beach' | 'outdoor' | 'business'
export const KINDS: TripKind[] = ['city', 'beach', 'outdoor', 'business']
export type CheckItem = { id: string; label: string; category: Category; qty: number; match: string[]; packed: boolean; source: 'rule' | 'ai' | 'manual'; note?: string }
export type Trip = {
  id: string; name: string; destination: string; start: string; end: string
  climate: Climate; kind: TripKind; activities: string[]
  bagId: string | null; checklist: CheckItem[]; placements: Placement[]; loose: Loose[]; sample?: boolean
}
export type State = { items: Item[]; bags: Bag[]; trips: Trip[]; activeTripId: string | null; apiKey: string; packsTo: Record<Category, number> }

export const DEFAULT_PACKS_TO: Record<Category, number> = { clothing: 60, footwear: 100, toiletries: 90, electronics: 100, documents: 100, gear: 100, misc: 100 }
export const defaultKind = (c: Category): Kind => (c === 'clothing' ? 'soft' : 'rigid')
/** Colored-pencil set for items: hues kept clear of the provisional and wrong inks on both themes. */
export const SWATCHES = ['#c8714a', '#d0a33a', '#7d9b3f', '#3a9b8c', '#8a6bb8', '#b25e8f', '#8c6a4a', '#d98a9a']

export const uid = () => Math.random().toString(36).slice(2, 10)
export const isoDate = (d: Date) => d.toISOString().slice(0, 10)
export const nights = (t: { start: string; end: string }) => Math.max(1, Math.round((Date.parse(t.end) - Date.parse(t.start)) / 86400000))
export const matchItem = (c: CheckItem, items: Item[]) => items.find((i) => c.match.some((k) => i.name.toLowerCase().includes(k)))
/** Units of an item in the bag on this trip: rigid placements plus loose entries. */
export const packedCount = (trip: Trip, itemId: string) => trip.placements.filter((p) => p.itemId === itemId).length + trip.loose.filter((l) => l.itemId === itemId).length
export const isPacked = (c: CheckItem, trip: Trip, items: Item[]) => {
  if (c.packed) return true
  const m = matchItem(c, items)
  return !!m && packedCount(trip, m.id) > 0
}
export const fmtW = (g: number) => (Math.abs(g) >= 1000 ? (g / 1000).toFixed(2) + ' kg' : Math.round(g) + ' g')
export const fmtDim = (b: { l: number; w: number; h: number }) => `${b.l} × ${b.w} × ${b.h}`
export const fmtVol = (cm3: number) => (cm3 / 1000).toFixed(1) + ' L'
export const fmtSize = (i: Item) => (i.kind === 'rigid' ? `${fmtDim(i)} cm` : `${i.volume} L · packs to ${i.packsTo} %`)
export const fmtDate = (s: string) => new Date(s + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Packed Volume in cm³: what a soft item takes once stuffed into a bag. */
export const packedVolume = (i: SoftItem) => i.volume * 1000 * (i.packsTo / 100)
export const bagVolume = (b: Bag) => b.compartments.reduce((a, c) => a + volume(c), 0)
/** Height of the assembled bag: the top of the highest compartment. */
export const bagHeight = (b: Bag) => Math.max(0, ...b.compartments.map((c) => c.z + c.h))
export const mainOf = (b: Bag) => b.compartments[0]
export const newCompartment = (name: string, l: number, w: number, h: number, x = 0, y = 0, z = 0): Compartment => ({ id: uid(), name, l, w, h, x, y, z })
export const newBag = (name: string, l: number, w: number, h: number, empty: number, limit: number | null): Bag => ({ id: uid(), name, empty, limit, compartments: [newCompartment('Main', l, w, h)] })

/** Rigid placements of a trip as boxes, grouped by compartment. */
export function placedBoxes(trip: Trip, items: Item[]): Record<string, Placed[]> {
  const out: Record<string, Placed[]> = {}
  for (const p of trip.placements) {
    const it = items.find((i) => i.id === p.itemId)
    if (!it || it.kind !== 'rigid') continue
    ;(out[p.compartmentId] ??= []).push({ ...oriented(it, p.rot), x: p.x, y: p.y, z: p.z })
  }
  return out
}
/** Packed volume of loose items per compartment, cm³. */
export function looseVolumes(trip: Trip, items: Item[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of trip.loose) {
    const it = items.find((i) => i.id === l.itemId)
    if (it?.kind === 'soft') out[l.compartmentId] = (out[l.compartmentId] ?? 0) + packedVolume(it)
  }
  return out
}
/** Soft fill of one compartment: pour height, loose volume against free volume, and whether it is Over Volume. */
export function fillOf(c: Box, boxes: Placed[], looseVol: number) {
  const free = freeVolume(c, boxes)
  return { height: fillHeight(c, boxes, looseVol), free, ratio: free > 0 ? looseVol / free : looseVol > 0 ? Infinity : 0, over: looseVol > free + 1e-6 }
}
/** The compartment with the most room left for soft items, after rigid boxes and loose volume already there. */
export function roomiest(bag: Bag, boxes: Record<string, Placed[]>, loose: Record<string, number>): Compartment {
  return bag.compartments.reduce((best, c) => (freeVolume(c, boxes[c.id] ?? []) - (loose[c.id] ?? 0) > freeVolume(best, boxes[best.id] ?? []) - (loose[best.id] ?? 0) ? c : best))
}

/** Re-lays a trip into another bag: rigid items by tightest fit, soft items to the roomiest compartment. Rigid items that no longer fit return to the schedule. */
export function repack(bag: Bag, trip: Trip, items: Item[]): Pick<Trip, 'placements' | 'loose'> {
  const boxes = trip.placements.flatMap((p) => {
    const it = items.find((i) => i.id === p.itemId)
    return it?.kind === 'rigid' ? [{ key: p, box: it }] : []
  })
  const placements = autoPackBins(bag.compartments, boxes).placed.map((x) => ({ ...x.key, compartmentId: x.binId, x: x.p.x, y: x.p.y, z: x.p.z, rot: x.rot }))
  const placed = placedBoxes({ ...trip, placements }, items)
  const vols: Record<string, number> = {}
  const loose = trip.loose.map((l) => {
    const it = items.find((i) => i.id === l.itemId)
    const home = roomiest(bag, placed, vols)
    if (it?.kind === 'soft') vols[home.id] = (vols[home.id] ?? 0) + packedVolume(it)
    return { ...l, compartmentId: home.id }
  })
  return { placements, loose }
}

/** Turns a compartment 90° in plan and carries its placements with it. */
export function rotateCompartment(bag: Bag, compId: string, trips: Trip[], items: Item[]): { bag: Bag; trips: Trip[] } {
  const c = bag.compartments.find((x) => x.id === compId)
  if (!c) return { bag, trips }
  const rc = { ...c, l: c.w, w: c.l }
  return {
    bag: { ...bag, compartments: bag.compartments.map((x) => (x.id === compId ? rc : x)) },
    trips: trips.map((t) =>
      t.bagId !== bag.id ? t : {
        ...t,
        placements: t.placements.map((p) => {
          const it = items.find((i) => i.id === p.itemId)
          if (p.compartmentId !== compId || it?.kind !== 'rigid') return p
          const o = oriented(it, p.rot)
          return { ...p, x: c.w - p.y - o.w, y: p.x, rot: !p.rot }
        }),
      },
    ),
  }
}
