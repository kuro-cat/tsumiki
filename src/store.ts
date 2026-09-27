import { useEffect, useRef, useState } from 'react'
import { autoPackBins } from './lib/pack'
import { toPlacement } from './lib/packing'
import { suggest } from './lib/suggest'
import { DEFAULT_PACKS_TO, afterBagEdit, RETIRED_SWATCHES, bagLeaves, defaultUp, dropBag, duplicateTrip, orientationsOf, withLink, withoutItem, isoDate, mainOf, newBag, newCompartment, rotateCompartment, settleCompartments, uid, type Bag, type Boxed, type Category, type Compartment, type Item, type State, type Trip } from './lib/model'

export * from './lib/model'

export function newTrip(bagId: string | null): Trip {
  const bagIds = bagId ? [bagId] : []
  const start = new Date(); start.setDate(start.getDate() + 7)
  const end = new Date(start); end.setDate(end.getDate() + 3)
  return { id: uid(), name: 'New trip', destination: '', start: isoDate(start), end: isoDate(end), climate: 'mild', kind: 'city', activities: [], bagIds, checklist: [], placements: [], loose: [], worn: [] }
}

export function sampleState(): State {
  const S = true
  // Sample items are coloured by category so the swatches and fills are visible on first run.
  const tint: Record<Category, string> = { clothing: '#d0a33a', footwear: '#8c6a4a', toiletries: '#c98b52', electronics: '#4f7fae', documents: '#b8a07a', gear: '#3a9b8c', misc: '#7d9b3f' }
  const rigid = (name: string, category: Category, l: number, w: number, h: number, weight: number, qty = 1): Item => ({ id: uid(), name, category, kind: 'rigid', l, w, h, up: defaultUp(category), weight, qty, color: tint[category], sample: S })
  const soft = (name: string, category: Category, volume: number, weight: number, qty = 1): Item => ({ id: uid(), name, category, kind: 'soft', volume, packsTo: DEFAULT_PACKS_TO[category], weight, qty, color: tint[category], sample: S })
  const container = (name: string, l: number, w: number, h: number, weight: number, capacity: number): Item => ({ id: uid(), name, category: 'gear', kind: 'container', l, w, h, up: false, capacity, weight, qty: 1, color: tint.gear, sample: S })
  const items: Item[] = [
    container('Packing cube, M', 30, 20, 10, 120, 5.4),
    soft('T-shirt', 'clothing', 1.7, 150, 4),
    soft('Jeans', 'clothing', 4, 600),
    soft('Chinos', 'clothing', 3, 450),
    soft('Shorts', 'clothing', 1.6, 220, 3),
    soft('Pyjamas', 'clothing', 1.2, 250),
    soft('Underwear', 'clothing', 0.5, 70, 6),
    soft('Socks, pair', 'clothing', 0.3, 60, 6),
    soft('Light jacket', 'clothing', 5, 420),
    rigid('Sun hat', 'clothing', 30, 30, 8, 110),
    rigid('Sneakers, pair', 'footwear', 30, 20, 12, 700),
    rigid('Sandals', 'footwear', 27, 12, 8, 380),
    rigid('Toiletry kit', 'toiletries', 22, 12, 8, 500),
    rigid('Sunscreen', 'toiletries', 15, 6, 4, 210),
    rigid('Toothbrush and toothpaste', 'toiletries', 20, 4, 3, 90),
    rigid('Deodorant', 'toiletries', 12, 5, 4, 120),
    rigid('Medication and first aid', 'toiletries', 14, 10, 4, 150),
    rigid('Laptop 13"', 'electronics', 31, 22, 2, 1400),
    rigid('Phone charger', 'electronics', 8, 5, 3, 120),
    rigid('Power bank', 'electronics', 15, 7, 2, 350),
    rigid('Camera', 'electronics', 12, 8, 7, 500),
    rigid('Camera battery and SD cards', 'electronics', 8, 6, 2, 80),
    rigid('Headphones', 'electronics', 18, 16, 6, 260),
    rigid('Passport', 'documents', 13, 9, 1, 40),
    rigid('Wallet', 'documents', 11, 9, 2, 120),
    rigid('Water bottle', 'gear', 25, 7, 7, 300),
    rigid('Sunglasses, case', 'gear', 16, 7, 6, 90),
    soft('Laundry bag', 'gear', 0.6, 60),
    rigid('Book', 'misc', 20, 13, 3, 350),
  ]
  const backpack: Bag = {
    id: uid(), name: 'Travel backpack 40 L', empty: 1400, limit: 10000, heavy: 'low', sample: S,
    compartments: [newCompartment('Main', 50, 32, 20, 0, 0, 3), { ...newCompartment('Laptop sleeve', 36, 26, 3, 7, 3, 0), takes: ['electronics', 'documents'] }],
  }
  const daypack: Bag = { ...newBag('Daypack 18 L', 42, 26, 16, 600, null), sample: S }
  const bags: Bag[] = [backpack, daypack, { ...newBag('Checked suitcase', 68, 46, 26, 3800, 23000), sample: S }]
  const start = new Date(); start.setDate(start.getDate() + 14)
  const end = new Date(start); end.setDate(end.getDate() + 5)
  const trip: Trip = {
    id: uid(), name: 'Lisbon', destination: 'Lisbon, Portugal', start: isoDate(start), end: isoDate(end),
    climate: 'hot', kind: 'city', activities: ['photography'], bagIds: [backpack.id, daypack.id], checklist: [], placements: [], loose: [], worn: [], sample: S,
  }
  // Every entry can be met from the sample inventory, so Auto-pack can finish the trip. The daypack is the day bag, so that entry starts ticked.
  trip.checklist = suggest({ nights: 5, climate: trip.climate, kind: trip.kind, activities: trip.activities }).map((c) => ({ ...withLink(c, items), id: uid(), packed: c.label === 'Day bag' }))
  const byName = (n: string) => items.find((x) => x.name === n)!
  const pre = ['Laptop 13"', 'Toiletry kit', 'Sneakers, pair', 'Camera', 'Packing cube, M'].map((n, i) => ({ key: `${byName(n).id}:${i}`, box: byName(n) as Boxed, os: orientationsOf(byName(n) as Boxed) }))
  trip.placements = autoPackBins(backpack.compartments, pre).placed.map(toPlacement)
  const day = ['Water bottle', 'Book'].map((n, i) => ({ key: `${byName(n).id}:d${i}`, box: byName(n) as Boxed, os: orientationsOf(byName(n) as Boxed) }))
  trip.placements.push(...autoPackBins(daypack.compartments, day).placed.map(toPlacement))
  trip.worn = ['Sandals', 'Sun hat', 'Wallet'].map((n) => ({ id: uid(), itemId: byName(n).id }))
  const cube = trip.placements.find((p) => p.itemId === byName('Packing cube, M').id)
  trip.loose = [
    ...['T-shirt', 'T-shirt', 'Underwear', 'Underwear'].map((n) => ({ id: uid(), itemId: byName(n).id, home: cube?.id ?? mainOf(backpack).id })),
    { id: uid(), itemId: byName('Jeans').id, home: mainOf(backpack).id },
  ]
  return { items, bags, trips: [trip], activeTripId: trip.id, apiKey: '', packsTo: { ...DEFAULT_PACKS_TO } }
}

export const KEY = 'bin-pack.v7'
function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const s = JSON.parse(raw) as State; return { ...s, items: s.items.map((i) => (i.color && RETIRED_SWATCHES[i.color] ? { ...i, color: RETIRED_SWATCHES[i.color] } : i)) } }
  } catch { /* fall through to sample */ }
  return sampleState()
}

const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [...list, x])

/** A notice for the traveler; with undo, it offers to put back what the last removal took. */
export type Notice = { text: string; red?: boolean; undo?: State; n: number }

export function useStore() {
  const [state, setState] = useState<State>(load)
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage unavailable: session-only */ }
  }, [state])
  // Every removal keeps the state before it, so the notice can undo it: nothing is lost to a wrong tap.
  const [notice, setNotice] = useState<Notice | null>(null)
  const now = useRef(state); now.current = state
  const name = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? 'it'
  const api = {
    /** Call just before a removal: the notice names it and offers Undo. */
    snap: (text: string) => setNotice({ text, undo: now.current, n: Date.now() }),
    say: (text: string, red = false) => setNotice({ text, red, n: Date.now() }),
    undo: () => { if (notice?.undo) { setState(notice.undo); setNotice({ text: 'Put back', n: Date.now() }) } },
    dismiss: () => setNotice(null),
    notice,
    set: (patch: Partial<State>) => setState((s) => ({ ...s, ...patch })),
    replace: (s: State) => setState(s),
    upsertItem: (it: Item) => setState((s) => ({ ...s, items: upsert(s.items, it) })),
    removeItem: (id: string) => { api.snap(`Deleted ${name(now.current.items, id)}`); setState((s) => ({ ...s, items: s.items.filter((i) => i.id !== id), trips: s.trips.map((t) => withoutItem(t, id)) })) },
    /** Saves a bag, settled so nothing floats. Trips using it re-seat what a smaller compartment no longer holds; anything with no room left comes out, with Undo. */
    upsertBag: (raw: Bag) => {
      const s = now.current
      const b = { ...raw, compartments: settleCompartments(raw.compartments) }
      const before = s.bags.find((x) => x.id === b.id)
      const trips = before ? s.trips.map((t) => afterBagEdit(t, before, b, s.items)) : s.trips
      const out = s.trips.flatMap((t, i) => t.placements.filter((p) => !trips[i].placements.some((q) => q.id === p.id)))
      if (out.length) api.snap(`${out.length === 1 ? `${name(s.items, out[0].itemId)} no longer fits` : `${out.length} items no longer fit`} in ${b.name} and came out`)
      setState({ ...s, bags: upsert(s.bags, b), trips })
    },
    removeBag: (id: string) => { api.snap(`Deleted ${name(now.current.bags, id)}`); setState((s) => {
      const bag = s.bags.find((b) => b.id === id)
      return { ...s, bags: s.bags.filter((b) => b.id !== id), trips: s.trips.map((t) => (bag && t.bagIds.includes(id) ? { ...t, bagIds: t.bagIds.filter((x) => x !== id), ...dropBag(bag, t), ...bagLeaves(t, id) } : t)) }
    }) },
    moveBag: (from: number, to: number) => setState((s) => { const bags = [...s.bags]; const [b] = bags.splice(from, 1); bags.splice(to, 0, b); return { ...s, bags } }),
    /** Moves one compartment, then lets the whole assembly settle so nothing is left floating. */
    patchCompartment: (bagId: string, compId: string, patch: Partial<Compartment>) =>
      setState((s) => ({ ...s, bags: s.bags.map((b) => (b.id !== bagId ? b : { ...b, compartments: settleCompartments(b.compartments.map((c) => (c.id === compId ? { ...c, ...patch } : c))) })) })),
    rotateCompartment: (bagId: string, compId: string) => setState((s) => {
      const bag = s.bags.find((b) => b.id === bagId)
      if (!bag) return s
      const r = rotateCompartment(bag, compId, s.trips, s.items)
      return { ...s, bags: upsert(s.bags, { ...r.bag, compartments: settleCompartments(r.bag.compartments) }), trips: r.trips }
    }),
    upsertTrip: (t: Trip) => setState((s) => ({ ...s, trips: upsert(s.trips, t), activeTripId: s.activeTripId ?? t.id })),
    /** Copies a trip for a repeat journey and makes the copy active; Undo takes the copy away. */
    duplicateTrip: (id: string) => {
      const s = now.current, t = s.trips.find((x) => x.id === id)
      if (!t) return null
      const copy = duplicateTrip(t, new Date())
      api.snap(`Copied ${t.name}`)
      setState({ ...s, trips: [...s.trips, copy], activeTripId: copy.id })
      return copy
    },
    removeTrip: (id: string) => { api.snap(`Deleted ${name(now.current.trips, id)}`); setState((s) => { const trips = s.trips.filter((t) => t.id !== id); return { ...s, trips, activeTripId: s.activeTripId === id ? trips[0]?.id ?? null : s.activeTripId } }) },
    patchTrip: (id: string, patch: Partial<Trip> | ((t: Trip) => Partial<Trip>)) =>
      setState((s) => ({ ...s, trips: s.trips.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)) })),
  }
  return [state, api] as const
}
export type Api = ReturnType<typeof useStore>[1]
