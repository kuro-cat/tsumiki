import { autoPackBins, type Placed } from './pack.ts'
import { entryUnits, fmtDim, isBoxed, lenUnit, linkedItems, looseVolumes, orientationsOf, packedCount, packedVolume, placedBoxes, placedContainers, roomiestHome, takers, uid, type Bag, type Boxed, type Compartment, type Item, type Loose, type Placement, type SoftItem, type Trip } from './model.ts'

/** An autopack result as a Placement. A key is an item id, with ':n' after it when several units of one item pack together. */
export const toPlacement = (x: { key: string; binId: string; p: Placed; o: number }): Placement =>
  ({ id: uid(), itemId: x.key.split(':')[0], compartmentId: x.binId, x: x.p.x, y: x.p.y, z: x.p.z, o: x.o })

/** The best free spot for one unit among these compartments, around what is already placed; null when no gap is big enough. */
export function fitOne(comps: Compartment[], it: Boxed, taken: Record<string, Placed[]> = {}): Placement | null {
  const r = autoPackBins(comps, [{ key: it.id, box: it, os: orientationsOf(it) }], taken)
  return r.placed.length ? toPlacement(r.placed[0]) : null
}

/** The best free spot for one unit in a bag, chosen the way Auto-pack would: only compartments that take its category, heavy items where the bag says. */
export function packOne(bag: Bag, it: Boxed, taken: Record<string, Placed[]> = {}): Placement | null {
  const r = autoPackBins(bag.compartments, [{ key: it.id, box: it, os: orientationsOf(it), weight: it.weight, bins: takers(bag, it.category).map((c) => c.id) }], taken, bag.heavy)
  return r.placed.length ? toPlacement(r.placed[0]) : null
}
/** The bag as a soft unit sees it: only compartments that take its category, or all of them when none does, since soft items always have a home. */
const softBag = (bag: Bag, it: Item): Bag => { const allowed = takers(bag, it.category); return allowed.length ? { ...bag, compartments: allowed } : bag }

/** A placed unit moved into another bag, placed as the trip will be once it has left; null when it doesn't fit there.
 *  It keeps its placement id, so a container keeps what it holds. */
export function moveInto(trip: Trip, items: Item[], placementId: string, to: Bag): Placement | null {
  const pl = trip.placements.find((p) => p.id === placementId)
  const it = pl && items.find((i) => i.id === pl.itemId)
  if (!pl || !it || !isBoxed(it)) return null
  const spot = packOne(to, it, placedBoxes({ ...trip, placements: trip.placements.filter((p) => p.id !== placementId) }, items))
  return spot && { ...spot, id: placementId }
}

/** Why a boxed item has no spot in the bag, and which other bag on the trip could take it. */
export function noFitReason(bag: Bag, others: Bag[], it: Boxed, taken: Record<string, Placed[]>): string {
  const why = !takers(bag, it.category).length ? `has no compartment in ${bag.name} that takes ${it.category}` : packOne(bag, it) ? 'has no gap big enough left' : `is bigger than every compartment in ${bag.name}`
  const other = others.find((b) => packOne(b, it, taken))
  return `${it.name} (${fmtDim(it)} ${lenUnit()}) ${why}.${other ? ` It fits in ${other.name}.` : ''}`
}

/** Containers placed in one bag of the trip. */
export const bagContainers = (trip: Trip, items: Item[], bag: Bag) =>
  placedContainers(trip, items).filter((c) => bag.compartments.some((x) => x.id === c.compartmentId))

/** One unit of a soft item packed into a bag: into the container or compartment with the most room for it, among those that take it. */
export function looseInBag(trip: Trip, items: Item[], bag: Bag, it: SoftItem): Loose {
  const home = roomiestHome(softBag(bag, it), bagContainers(trip, items, bag), placedBoxes(trip, items), looseVolumes(trip, items), packedVolume(it))
  return { id: uid(), itemId: it.id, home }
}

/** What Auto-pack takes: each checklist entry's shortfall, from its linked items in link order, never more than is owned and unpacked.
 *  With nothing on the list linked to the inventory, every unpacked unit of every item, by name. */
export function unitsToPack(trip: Trip, items: Item[]): Item[] {
  const left: Record<string, number> = Object.fromEntries(items.map((it) => [it.id, Math.max(0, it.qty - packedCount(trip, it.id))]))
  const units = (it: Item, n: number) => Array.from({ length: n }, () => it)
  if (!trip.checklist.some((c) => linkedItems(c, items).length)) {
    return [...items].sort((a, b) => a.name.localeCompare(b.name)).flatMap((it) => units(it, left[it.id]))
  }
  return trip.checklist.flatMap((c) => {
    let need = Math.max(0, c.qty - entryUnits(c, trip, items))
    return linkedItems(c, items).flatMap((it) => {
      const n = Math.min(need, left[it.id])
      need -= n
      left[it.id] -= n
      return units(it, n)
    })
  })
}

/** Packs units into a bag around what is already there: boxes first, then each soft unit into the roomiest home as the bag fills.
 *  Each unit goes only in compartments that take its category, and heavy items go where the bag says. A box no compartment takes is left out;
 *  a soft unit no compartment takes goes in the roomiest anyway, since soft items always have a home. */
export function autoPackInto(trip: Trip, items: Item[], bag: Bag, units: Item[]) {
  const boxes = units.flatMap((it, i) => (isBoxed(it) ? [{ key: `${it.id}:${i}`, box: it, os: orientationsOf(it), weight: it.weight, bins: takers(bag, it.category).map((c) => c.id) }] : []))
  const res = autoPackBins(bag.compartments, boxes, placedBoxes(trip, items), bag.heavy)
  const placements = res.placed.map(toPlacement)
  const next = { ...trip, placements: [...trip.placements, ...placements] }
  const taken = placedBoxes(next, items), cubes = bagContainers(next, items, bag)
  const vols = looseVolumes(trip, items)
  const loose = units.flatMap((it): Loose[] => {
    if (it.kind !== 'soft') return []
    const pv = packedVolume(it)
    const home = roomiestHome(softBag(bag, it), cubes, taken, vols, pv)
    vols[home] = (vols[home] ?? 0) + pv
    return [{ id: uid(), itemId: it.id, home }]
  })
  return { placements, loose, unplaced: res.unplaced.length }
}
