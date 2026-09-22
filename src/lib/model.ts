import { ALL_ORIENTATIONS, UPRIGHT, autoPackBins, fillHeight, freeVolume, oriented, volume, type Box, type Placed } from './pack.ts'

export type Category = 'clothing' | 'footwear' | 'toiletries' | 'electronics' | 'documents' | 'gear' | 'misc'
export const CATEGORIES: Category[] = ['clothing', 'footwear', 'toiletries', 'electronics', 'documents', 'gear', 'misc']
export type Kind = 'rigid' | 'soft' | 'container'
/** color is an optional hex; undefined draws the item in paper. */
type ItemBase = { id: string; name: string; category: Category; weight: number; qty: number; color?: string; sample?: boolean }
/** Keeps its shape: a box that occupies exactly its L × W × H. up is This Side Up: only the two plan turns of the measured orientation are allowed. */
export type RigidItem = ItemBase & { kind: 'rigid'; l: number; w: number; h: number; up: boolean }
/** No fixed shape: a measured volume in litres that packs to a percentage of itself. It has a home, never a position. */
export type SoftItem = ItemBase & { kind: 'soft'; volume: number; packsTo: number }
/** A rigid item that also holds soft items: a packing cube. capacity is what it holds, in litres. */
export type ContainerItem = ItemBase & { kind: 'container'; l: number; w: number; h: number; up: boolean; capacity: number }
export type Item = RigidItem | SoftItem | ContainerItem
/** Anything with a placement: rigid items and containers. */
export type Boxed = RigidItem | ContainerItem
export const isBoxed = (i: Item): i is Boxed => i.kind !== 'soft'
/** One box-shaped space inside a bag. x, y, z is where the traveler assembled it relative to the bag; Main is first. */
export type Compartment = { id: string; name: string; l: number; w: number; h: number; x: number; y: number; z: number }
export type Bag = { id: string; name: string; empty: number; limit: number | null; compartments: Compartment[]; sample?: boolean }
/** o is the orientation index, see pack.ts. */
export type Placement = { id: string; itemId: string; compartmentId: string; x: number; y: number; z: number; o: number }
/** A soft item's home on a trip: one entry per unit, no position. home is a compartment id or the placement id of a container. */
export type Loose = { id: string; itemId: string; home: string }
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
export const defaultUp = (c: Category) => c === 'electronics' || c === 'toiletries'
export const orientationsOf = (it: Boxed) => (it.up ? UPRIGHT : ALL_ORIENTATIONS)
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
export const fmtSize = (i: Item) => (i.kind === 'soft' ? `${i.volume} L · packs to ${i.packsTo} %` : i.kind === 'container' ? `${fmtDim(i)} cm · holds ${i.capacity} L` : `${fmtDim(i)} cm`)
export const fmtDate = (s: string) => new Date(s + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Packed Volume in cm³: what a soft item takes once stuffed into a bag. */
export const packedVolume = (i: SoftItem) => i.volume * 1000 * (i.packsTo / 100)
/** Capacity prefill: 90 % of the outer box, in litres to one decimal. */
export const defaultCapacity = (b: Box) => Math.round(volume(b) * 0.9 / 100) / 10
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
    if (!it || !isBoxed(it)) continue
    ;(out[p.compartmentId] ??= []).push({ ...oriented(it, p.o), x: p.x, y: p.y, z: p.z })
  }
  return out
}
/** Packed volume of loose items per home (compartment id or container placement id), cm³. */
export function looseVolumes(trip: Trip, items: Item[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of trip.loose) {
    const it = items.find((i) => i.id === l.itemId)
    if (it?.kind === 'soft') out[l.home] = (out[l.home] ?? 0) + packedVolume(it)
  }
  return out
}
/** Containers placed on a trip, with what each one holds. */
export type PlacedContainer = { id: string; it: ContainerItem }
export function placedContainers(trip: Trip, items: Item[]): PlacedContainer[] {
  return trip.placements.flatMap((p) => { const it = items.find((i) => i.id === p.itemId); return it?.kind === 'container' ? [{ id: p.id, it }] : [] })
}
/** Fill of one container: contents against capacity. */
export function containerFill(it: ContainerItem, looseVol: number) {
  const cap = it.capacity * 1000
  return { cap, free: cap - looseVol, ratio: cap > 0 ? looseVol / cap : Infinity, over: looseVol > cap + 1e-6 }
}
/** Home for one more soft unit of pv cm³: the roomiest container with room for it, else the roomiest compartment. */
export function roomiestHome(bag: Bag, containers: PlacedContainer[], boxes: Record<string, Placed[]>, loose: Record<string, number>, pv: number): string {
  let best: { id: string; free: number } | null = null
  for (const c of containers) {
    const free = containerFill(c.it, loose[c.id] ?? 0).free
    if (free >= pv - 1e-6 && (!best || free > best.free)) best = { id: c.id, free }
  }
  return best?.id ?? roomiest(bag, boxes, loose).id
}
/** Removes placements and, for containers, what they hold. */
export function withoutPlacements(t: Trip, ids: Set<string>): Pick<Trip, 'placements' | 'loose'> {
  return { placements: t.placements.filter((p) => !ids.has(p.id)), loose: t.loose.filter((l) => !ids.has(l.home)) }
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

/** Re-lays a trip into another bag: boxed items by tightest fit, soft items stay in their container if it made it, else go to the roomiest home. Boxed items that no longer fit return to the schedule with their contents. */
export function repack(bag: Bag, trip: Trip, items: Item[]): Pick<Trip, 'placements' | 'loose'> {
  const boxes = trip.placements.flatMap((p) => {
    const it = items.find((i) => i.id === p.itemId)
    return it && isBoxed(it) ? [{ key: p, box: it, os: orientationsOf(it) }] : []
  })
  const placements = autoPackBins(bag.compartments, boxes).placed.map((x) => ({ ...x.key, compartmentId: x.binId, x: x.p.x, y: x.p.y, z: x.p.z, o: x.o }))
  const next = { ...trip, placements }
  const placed = placedBoxes(next, items), containers = placedContainers(next, items)
  const kept = new Set(containers.map((c) => c.id))
  const vols: Record<string, number> = {}
  const loose = trip.loose.flatMap((l) => {
    const it = items.find((i) => i.id === l.itemId)
    if (it?.kind !== 'soft') return []
    if (!kept.has(l.home) && trip.placements.some((p) => p.id === l.home)) return [] // its container left the bag
    const pv = packedVolume(it)
    const home = kept.has(l.home) ? l.home : roomiestHome(bag, containers, placed, vols, pv)
    vols[home] = (vols[home] ?? 0) + pv
    return [{ ...l, home }]
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
          if (p.compartmentId !== compId || !it || !isBoxed(it)) return p
          const d = oriented(it, p.o)
          return { ...p, x: c.w - p.y - d.w, y: p.x, o: p.o ^ 1 }
        }),
      },
    ),
  }
}
