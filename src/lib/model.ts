import { ALL_ORIENTATIONS, UPRIGHT, autoPackBins, dropZ, fillHeight, fits, freeVolume, oriented, volume, type Box, type Heavy, type Placed } from './pack.ts'
import { fmtDim, lenUnit } from './units.ts'
export * from './units.ts'

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
/** One box-shaped space inside a bag. x, y, z is where the traveler assembled it relative to the bag; Main is first. color is a block key, absent for the default by position.
 *  takes lists the categories Auto-pack may put in it; absent or empty takes anything. Packing by hand ignores it. */
export type Compartment = { id: string; name: string; l: number; w: number; h: number; x: number; y: number; z: number; color?: BlockKey; takes?: Category[] }
/** The block colours a compartment can wear, by CSS token. Compartments default to the first four by position. */
export const BLOCKS = [['b1', 'Spruce'], ['b2', 'Moss'], ['b3', 'Lake'], ['b4', 'Bark'], ['b5', 'Fern'], ['b6', 'Slate sea']] as const
export type BlockKey = (typeof BLOCKS)[number][0]
export const blockKey = (c: Pick<Compartment, 'color'>, i: number): BlockKey => c.color ?? BLOCKS[i % 4][0]
/** heavy is where Auto-pack puts heavy items (see pack.ts); absent packs by size alone. */
export type Bag = { id: string; name: string; empty: number; limit: number | null; compartments: Compartment[]; heavy?: Heavy; sample?: boolean }
/** o is the orientation index, see pack.ts. */
export type Placement = { id: string; itemId: string; compartmentId: string; x: number; y: number; z: number; o: number }
/** One unit on the traveler's body: counts as packed, takes no bag space and no bag weight. */
export type Worn = { id: string; itemId: string }
/** A soft item's home on a trip: one entry per unit, no position. home is a compartment id or the placement id of a container. */
export type Loose = { id: string; itemId: string; home: string }
/** Two or more of a trip's bags judged together against one limit, in grams. A bag is in at most one. */
export type SharedLimit = { id: string; bagIds: string[]; limit: number }
export type Climate = 'hot' | 'mild' | 'cold' | 'mixed'
export const CLIMATES: Climate[] = ['hot', 'mild', 'cold', 'mixed']
export type TripKind = 'city' | 'beach' | 'outdoor' | 'business'
export const KINDS: TripKind[] = ['city', 'beach', 'outdoor', 'business']
/** itemIds is the Link: absent means unpinned (keywords guess live), present means pinned, [] means not in inventory. */
export type CheckItem = { id: string; label: string; category: Category; qty: number; match: string[]; itemIds?: string[]; packed: boolean; source: 'rule' | 'ai' | 'manual'; note?: string }
export type Trip = {
  id: string; name: string; destination: string; start: string; end: string
  climate: Climate; kind: TripKind; activities: string[]
  bagIds: string[]; checklist: CheckItem[]; placements: Placement[]; loose: Loose[]; worn: Worn[]; sample?: boolean
  /** Actual Weight in grams by bag id, for the bags that have been weighed. */
  weighed?: Record<string, number>
  shared?: SharedLimit[]
  /** Reserve by bag id: room kept free for the way home, volume in cm³ and weight in grams. */
  reserve?: Record<string, { volume: number; weight: number }>
}
export type State = { items: Item[]; bags: Bag[]; trips: Trip[]; activeTripId: string | null; apiKey: string; packsTo: Record<Category, number> }

export const DEFAULT_PACKS_TO: Record<Category, number> = { clothing: 60, footwear: 100, toiletries: 90, electronics: 100, documents: 100, gear: 100, misc: 100 }
export const defaultKind = (c: Category): Kind => (c === 'clothing' ? 'soft' : 'rigid')
export const defaultUp = (c: Category) => c === 'electronics' || c === 'toiletries'
export const orientationsOf = (it: Boxed) => (it.up ? UPRIGHT : ALL_ORIENTATIONS)
/** Colored-pencil set for items: hues kept clear of the provisional and wrong inks on both themes. */
export const SWATCHES = ['#c98b52', '#d0a33a', '#7d9b3f', '#3a9b8c', '#4f7fae', '#6e8c9e', '#8c6a4a', '#b8a07a']
/** Swatches retired for reading as purple or pink, and what saved items wear instead. */
export const RETIRED_SWATCHES: Record<string, string> = { '#8a6bb8': '#4f7fae', '#b25e8f': '#6e8c9e', '#d98a9a': '#b8a07a', '#c8714a': '#c98b52' }

export const uid = () => Math.random().toString(36).slice(2, 10)
export const isoDate = (d: Date) => d.toISOString().slice(0, 10)
export const nights = (t: { start: string; end: string }) => Math.max(1, Math.round((Date.parse(t.end) - Date.parse(t.start)) / 86400000))
const keywordItems = (c: Pick<CheckItem, 'match'>, items: Item[]) => items.filter((i) => c.match.some((k) => i.name.toLowerCase().includes(k)))
/** The items a checklist entry stands for: its pinned Link, else every item a keyword matches. */
export const linkedItems = (c: CheckItem, items: Item[]) => (c.itemIds ? items.filter((i) => c.itemIds!.includes(i.id)) : keywordItems(c, items))
/** Pins the keyword guess at creation when it finds anything; otherwise the entry stays unpinned and keeps guessing. */
export const withLink = <C extends Omit<CheckItem, 'id' | 'packed'>>(c: C, items: Item[]): C => { const g = keywordItems(c, items); return g.length ? { ...c, itemIds: g.map((i) => i.id) } : c }
export const wornCount = (trip: Trip, itemId: string) => trip.worn.filter((w) => w.itemId === itemId).length
/** Units of an item in the bag on this trip: rigid placements plus loose entries plus worn. */
export const packedCount = (trip: Trip, itemId: string) => trip.placements.filter((p) => p.itemId === itemId).length + trip.loose.filter((l) => l.itemId === itemId).length + wornCount(trip, itemId)
export const wornWeight = (trip: Trip, items: Item[]) => trip.worn.reduce((a, w) => a + (items.find((i) => i.id === w.itemId)?.weight ?? 0), 0)
/** Packed units across an entry's linked items. */
export const entryUnits = (c: CheckItem, trip: Trip, items: Item[]) => linkedItems(c, items).reduce((a, i) => a + packedCount(trip, i.id), 0)
export const isPacked = (c: CheckItem, trip: Trip, items: Item[]) => c.packed || (linkedItems(c, items).length > 0 && entryUnits(c, trip, items) >= c.qty)
export const fmtVol = (cm3: number) => (cm3 / 1000).toFixed(1) + ' L'
export const fmtSize = (i: Item) => (i.kind === 'soft' ? `${i.volume} L, ${(packedVolume(i) / 1000).toFixed(1)} L packed` : i.kind === 'container' ? `${fmtDim(i)} ${lenUnit()} · holds ${i.capacity} L` : `${fmtDim(i)} ${lenUnit()}`)
export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
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
export type PlacedContainer = { id: string; compartmentId: string; it: ContainerItem }
export function placedContainers(trip: Trip, items: Item[]): PlacedContainer[] {
  return trip.placements.flatMap((p) => { const it = items.find((i) => i.id === p.itemId); return it?.kind === 'container' ? [{ id: p.id, compartmentId: p.compartmentId, it }] : [] })
}
export const tripBags = (trip: Pick<Trip, 'bagIds'>, bags: Bag[]) => trip.bagIds.flatMap((id) => bags.filter((b) => b.id === id))
/** Placements and loose entries that live in one bag of a trip. */
export function inBag(bag: Bag, trip: Trip): Pick<Trip, 'placements' | 'loose'> {
  const comps = new Set(bag.compartments.map((c) => c.id))
  const placements = trip.placements.filter((p) => comps.has(p.compartmentId))
  const pids = new Set(placements.map((p) => p.id))
  return { placements, loose: trip.loose.filter((l) => comps.has(l.home) || pids.has(l.home)) }
}
export type WeightState = 'no limit' | 'over' | 'near limit' | 'balanced' | 'light'
export const weightState = (total: number, limit: number | null): WeightState => (limit == null ? 'no limit' : total / limit > 1 ? 'over' : total / limit > 0.85 ? 'near limit' : total / limit >= 0.5 ? 'balanced' : 'light')
/** What the title block and bag strip report for one bag on a trip. total is the Actual Weight when weighed, else the Estimate.
 *  The Reserve counts against the limit and the bag's volume (margin, wState, over) but not in total or fill. */
export function bagTotals(bag: Bag, trip: Trip, items: Item[]) {
  const { placements, loose } = inBag(bag, trip)
  const find = (id: string) => items.find((i) => i.id === id)
  const itemsW = placements.reduce((a, p) => a + (find(p.itemId)?.weight ?? 0), 0) + loose.reduce((a, l) => a + (find(l.itemId)?.weight ?? 0), 0)
  const estimate = bag.empty + itemsW
  const actual = trip.weighed?.[bag.id] ?? null
  const total = actual ?? estimate
  const boxes = placedBoxes(trip, items), lv = looseVolumes(trip, items)
  const rigidVol = placements.reduce((a, p) => { const it = find(p.itemId); return a + (it && isBoxed(it) ? volume(it) : 0) }, 0)
  const pids = new Set(placements.map((p) => p.id))
  // What sits inside a container is already inside its box, which rigidVol counts; only soft items loose in a compartment add room taken.
  const looseVol = loose.reduce((a, l) => { const it = find(l.itemId); return a + (it?.kind === 'soft' && !pids.has(l.home) ? packedVolume(it) : 0) }, 0)
  const reserved = trip.reserve?.[bag.id] ?? { volume: 0, weight: 0 }
  // The Reserve is kept at bag level: which pocket the souvenirs go in is not known yet.
  const over = rigidVol + looseVol + reserved.volume > bagVolume(bag) + 1e-6 || bag.compartments.some((c) => fillOf(c, boxes[c.id] ?? [], lv[c.id] ?? 0).over) || placedContainers(trip, items).some((c) => pids.has(c.id) && containerFill(c.it, lv[c.id] ?? 0).over)
  return { count: placements.length + loose.length, itemsW, estimate, actual, total, limit: bag.limit, margin: bag.limit == null ? null : bag.limit - total - reserved.weight, wState: weightState(total + reserved.weight, bag.limit), fill: (rigidVol + looseVol) / bagVolume(bag), over, reserved }
}
/** Each Shared Limit of a trip against the sum of its bags' Totals plus their reserved weight. */
export function sharedTotals(trip: Trip, bags: Bag[], items: Item[]) {
  return (trip.shared ?? []).map((s) => {
    const members = tripBags(s, bags)
    const total = members.reduce((a, b) => a + bagTotals(b, trip, items).total, 0)
    const reserved = members.reduce((a, b) => a + (trip.reserve?.[b.id]?.weight ?? 0), 0)
    return { ...s, members, total, reserved, wState: weightState(total + reserved, s.limit), over: total + reserved > s.limit }
  })
}
/** The trip's weighed, reserve and shared records once bag `from` leaves it. With `to`, the swapped-in bag takes its place in its Shared Limit; a Shared Limit left with one bag is gone. */
export function bagLeaves(trip: Trip, from: string, to?: string): Pick<Trip, 'weighed' | 'reserve' | 'shared'> {
  const { [from]: _gone, ...weighed } = trip.weighed ?? {}
  const { [from]: _kept, ...reserve } = trip.reserve ?? {}
  const shared = (trip.shared ?? []).map((s) => ({ ...s, bagIds: s.bagIds.flatMap((id) => (id !== from ? [id] : to ? [to] : [])) })).filter((s) => s.bagIds.length > 1)
  return { weighed, reserve, shared }
}
/** The trip is ready to travel: checklist packed, something in the bags, every bag and Shared Limit under its limit, nothing over volume, Reserves included. */
export function tripReady(trip: Trip, bags: Bag[], items: Item[]) {
  const tb = tripBags(trip, bags)
  if (!tb.length || !trip.checklist.length || !trip.checklist.every((c) => isPacked(c, trip, items))) return false
  const totals = tb.map((b) => bagTotals(b, trip, items))
  return (totals.some((t) => t.count > 0) || trip.worn.length > 0) && totals.every((t) => !t.over && (t.margin == null || t.margin >= 0)) && sharedTotals(trip, bags, items).every((s) => !s.over)
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
/** A trip without one bag's packing: its items return to the schedule. */
export function dropBag(bag: Bag, trip: Trip): Pick<Trip, 'placements' | 'loose'> {
  const mine = inBag(bag, trip)
  const r = withoutPlacements(trip, new Set(mine.placements.map((p) => p.id)))
  return { placements: r.placements, loose: r.loose.filter((l) => !mine.loose.includes(l)) }
}
/** A trip after one of its bags was edited. Placements in compartments the bag no longer has come out, with what they held,
 *  and loose units there move to Main. A box that overhangs a compartment made smaller moves to the best free spot in the bag,
 *  keeping its id (a cube keeps what it holds), or comes out when there is no room. The trip's other bags are left as they are. */
export function afterBagEdit(trip: Trip, before: Bag, after: Bag, items: Item[]): Trip {
  if (!trip.bagIds.includes(after.id)) return trip
  const gone = new Set(before.compartments.filter((c) => !after.compartments.some((x) => x.id === c.id)).map((c) => c.id))
  const boxed = (p: Placement) => { const it = items.find((i) => i.id === p.itemId); return it && isBoxed(it) ? it : null }
  const overhangs = trip.placements.filter((p) => {
    const c = after.compartments.find((x) => x.id === p.compartmentId), it = boxed(p)
    return !!c && !!it && !fits(c, [], { ...oriented(it, p.o), x: p.x, y: p.y, z: p.z })
  })
  const staying = trip.placements.filter((p) => !gone.has(p.compartmentId) && !overhangs.includes(p))
  const moved = autoPackBins(after.compartments, overhangs.map((p) => ({ key: p, box: boxed(p)!, os: orientationsOf(boxed(p)!) })), placedBoxes({ ...trip, placements: staying }, items))
    .placed.map((x): Placement => ({ ...x.key, compartmentId: x.binId, x: x.p.x, y: x.p.y, z: x.p.z, o: x.o }))
  const out = trip.placements.filter((p) => gone.has(p.compartmentId) || (overhangs.includes(p) && !moved.some((m) => m.id === p.id)))
  const r = withoutPlacements(trip, new Set(out.map((p) => p.id)))
  return {
    ...trip,
    placements: r.placements.map((p) => moved.find((m) => m.id === p.id) ?? p),
    loose: r.loose.map((l) => (gone.has(l.home) ? { ...l, home: mainOf(after).id } : l)),
  }
}
/** A trip without one item: its placements (with what they held), loose and worn units go, and checklist entries stop linking to it.
 *  An entry whose only link it was goes back to matching by name. */
export function withoutItem(trip: Trip, itemId: string): Trip {
  const r = withoutPlacements(trip, new Set(trip.placements.filter((p) => p.itemId === itemId).map((p) => p.id)))
  const checklist = trip.checklist.map((c) => {
    if (!c.itemIds?.includes(itemId)) return c
    const rest = c.itemIds.filter((x) => x !== itemId)
    const { itemIds: _pinned, ...byName } = c
    return rest.length ? { ...c, itemIds: rest } : byName
  })
  return { ...trip, checklist, placements: r.placements, loose: r.loose.filter((l) => l.itemId !== itemId), worn: trip.worn.filter((w) => w.itemId !== itemId) }
}
/** A copy for a repeat trip: same bags, checklist and packing under new ids, a week from today for the same number of nights.
 *  Hand ticks and Actual Weights stay with the old trip; Shared Limits keep their bags, which are shared, not copied. */
export function duplicateTrip(trip: Trip, today: Date): Trip {
  const { weighed: _weighed, sample: _sample, ...rest } = trip
  const pids = new Map(trip.placements.map((p) => [p.id, uid()]))
  const fresh = <T extends { id: string }>(x: T): T => ({ ...x, id: uid() })
  const start = new Date(today); start.setDate(start.getDate() + 7)
  const end = new Date(start); end.setDate(end.getDate() + Math.round((Date.parse(trip.end) - Date.parse(trip.start)) / 86400000))
  return {
    ...rest, id: uid(), name: `${trip.name} copy`, start: isoDate(start), end: isoDate(end),
    checklist: trip.checklist.map((c) => ({ ...c, id: uid(), packed: false })),
    placements: trip.placements.map((p) => ({ ...p, id: pids.get(p.id)! })),
    loose: trip.loose.map((l) => ({ ...l, id: uid(), home: pids.get(l.home) ?? l.home })),
    worn: trip.worn.map(fresh),
    ...(trip.shared ? { shared: trip.shared.map(fresh) } : {}),
  }
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
/** The compartments Auto-pack may put an item of this category in. */
export const takers = (bag: Bag, category: Category) => bag.compartments.filter((c) => !c.takes?.length || c.takes.includes(category))
export function roomiest(bag: Bag, boxes: Record<string, Placed[]>, loose: Record<string, number>): Compartment {
  return bag.compartments.reduce((best, c) => (freeVolume(c, boxes[c.id] ?? []) - (loose[c.id] ?? 0) > freeVolume(best, boxes[best.id] ?? []) - (loose[best.id] ?? 0) ? c : best))
}

/** Moves one bag's packing into another: boxed items by tightest fit, soft items stay in their container if it made it, else go to the roomiest home. Boxed items that no longer fit return to the schedule with their contents. Other bags are untouched. */
export function repack(from: Bag, to: Bag, trip: Trip, items: Item[]): Pick<Trip, 'placements' | 'loose'> {
  const mine = inBag(from, trip)
  const rest = withoutPlacements(trip, new Set(mine.placements.map((p) => p.id)))
  rest.loose = rest.loose.filter((l) => !mine.loose.includes(l))
  const boxes = mine.placements.flatMap((p) => {
    const it = items.find((i) => i.id === p.itemId)
    return it && isBoxed(it) ? [{ key: p, box: it, os: orientationsOf(it) }] : []
  })
  const placements = autoPackBins(to.compartments, boxes).placed.map((x) => ({ ...x.key, compartmentId: x.binId, x: x.p.x, y: x.p.y, z: x.p.z, o: x.o }))
  const next = { ...trip, placements: [...rest.placements, ...placements], loose: rest.loose }
  const placed = placedBoxes(next, items), containers = placedContainers(next, items).filter((c) => placements.some((p) => p.id === c.id))
  const kept = new Set(containers.map((c) => c.id))
  const vols = looseVolumes(next, items)
  const loose = mine.loose.flatMap((l) => {
    const it = items.find((i) => i.id === l.itemId)
    if (it?.kind !== 'soft') return []
    if (!kept.has(l.home) && mine.placements.some((p) => p.id === l.home)) return [] // its container left the bag
    const pv = packedVolume(it)
    const home = kept.has(l.home) ? l.home : roomiestHome(to, containers, placed, vols, pv)
    vols[home] = (vols[home] ?? 0) + pv
    return [{ ...l, home }]
  })
  return { placements: next.placements, loose: [...rest.loose, ...loose] }
}

/** Gravity for an assembled bag: lowest first, each compartment comes to rest on the floor or on whatever is under it, so nothing floats.
 *  z only orders the stack (raise one above another to put it on top). Anything moved past the bag's corner shifts the assembly back to 0. */
export function settleCompartments(comps: Compartment[]): Compartment[] {
  const mx = Math.min(0, ...comps.map((c) => c.x)), my = Math.min(0, ...comps.map((c) => c.y))
  const order = comps.map((c, i) => ({ c: { ...c, x: c.x - mx, y: c.y - my }, i })).sort((a, b) => a.c.z - b.c.z || a.i - b.i)
  const settled: Compartment[] = []
  for (const { c } of order) settled.push({ ...c, z: dropZ(settled, c) })
  return comps.map((c) => settled.find((s) => s.id === c.id)!)
}

/** Turns a compartment 90° in plan and carries its placements with it. */
export function rotateCompartment(bag: Bag, compId: string, trips: Trip[], items: Item[]): { bag: Bag; trips: Trip[] } {
  const c = bag.compartments.find((x) => x.id === compId)
  if (!c) return { bag, trips }
  const rc = { ...c, l: c.w, w: c.l }
  return {
    bag: { ...bag, compartments: bag.compartments.map((x) => (x.id === compId ? rc : x)) },
    trips: trips.map((t) =>
      !t.bagIds.includes(bag.id) ? t : {
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
