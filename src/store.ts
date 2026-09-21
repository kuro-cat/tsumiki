import { useEffect, useState } from 'react'
import { autoPackBins } from './lib/pack'
import { suggest } from './lib/suggest'
import { DEFAULT_PACKS_TO, isoDate, mainOf, newBag, newCompartment, rotateCompartment, uid, type Bag, type Category, type Compartment, type Item, type RigidItem, type State, type Trip } from './lib/model'

export * from './lib/model'

export function newTrip(bagId: string | null): Trip {
  const start = new Date(); start.setDate(start.getDate() + 7)
  const end = new Date(start); end.setDate(end.getDate() + 3)
  return { id: uid(), name: 'New trip', destination: '', start: isoDate(start), end: isoDate(end), climate: 'mild', kind: 'city', activities: [], bagId, checklist: [], placements: [], loose: [] }
}

function sampleState(): State {
  const S = true
  const rigid = (name: string, category: Category, l: number, w: number, h: number, weight: number, qty = 1): Item => ({ id: uid(), name, category, kind: 'rigid', l, w, h, weight, qty, sample: S })
  const soft = (name: string, category: Category, volume: number, weight: number, qty = 1): Item => ({ id: uid(), name, category, kind: 'soft', volume, packsTo: DEFAULT_PACKS_TO[category], weight, qty, sample: S })
  const items: Item[] = [
    soft('T-shirt', 'clothing', 1.7, 150, 4),
    soft('Jeans', 'clothing', 4, 600),
    soft('Shorts', 'clothing', 1.6, 220, 2),
    soft('Underwear', 'clothing', 0.5, 70, 6),
    soft('Socks, pair', 'clothing', 0.3, 60, 6),
    soft('Light jacket', 'clothing', 5, 420),
    rigid('Sun hat', 'clothing', 30, 30, 8, 110),
    rigid('Sneakers, pair', 'footwear', 30, 20, 12, 700),
    rigid('Sandals', 'footwear', 27, 12, 8, 380),
    rigid('Toiletry kit', 'toiletries', 22, 12, 8, 500),
    rigid('Sunscreen', 'toiletries', 15, 6, 4, 210),
    rigid('Laptop 13"', 'electronics', 31, 22, 2, 1400),
    rigid('Phone charger', 'electronics', 8, 5, 3, 120),
    rigid('Power bank', 'electronics', 15, 7, 2, 350),
    rigid('Camera', 'electronics', 12, 8, 7, 500),
    rigid('Headphones', 'electronics', 18, 16, 6, 260),
    rigid('Passport', 'documents', 13, 9, 1, 40),
    rigid('Wallet', 'documents', 11, 9, 2, 120),
    rigid('Water bottle', 'gear', 25, 7, 7, 300),
    rigid('Sunglasses, case', 'gear', 16, 7, 6, 90),
    soft('Laundry bag', 'gear', 0.6, 60),
    rigid('Book', 'misc', 20, 13, 3, 350),
  ]
  const backpack: Bag = {
    id: uid(), name: 'Travel backpack 40 L', empty: 1400, limit: 10000, sample: S,
    compartments: [newCompartment('Main', 50, 32, 20, 0, 0, 3), newCompartment('Laptop sleeve', 36, 26, 3, 7, 3, 0)],
  }
  const bags: Bag[] = [backpack, { ...newBag('Daypack 18 L', 42, 26, 16, 600, null), sample: S }, { ...newBag('Checked suitcase', 68, 46, 26, 3800, 23000), sample: S }]
  const start = new Date(); start.setDate(start.getDate() + 14)
  const end = new Date(start); end.setDate(end.getDate() + 5)
  const trip: Trip = {
    id: uid(), name: 'Lisbon', destination: 'Lisbon, Portugal', start: isoDate(start), end: isoDate(end),
    climate: 'hot', kind: 'city', activities: ['photography'], bagId: backpack.id, checklist: [], placements: [], loose: [], sample: S,
  }
  trip.checklist = suggest({ nights: 5, climate: trip.climate, kind: trip.kind, activities: trip.activities }).map((c) => ({ ...c, id: uid(), packed: false }))
  const byName = (n: string) => items.find((x) => x.name === n)!
  const pre = ['Laptop 13"', 'Toiletry kit', 'Sneakers, pair', 'Camera'].map((n, i) => ({ key: `${byName(n).id}:${i}`, box: byName(n) as RigidItem }))
  trip.placements = autoPackBins(backpack.compartments, pre).placed.map((x) => ({ id: uid(), itemId: x.key.split(':')[0], compartmentId: x.binId, x: x.p.x, y: x.p.y, z: x.p.z, rot: x.rot }))
  trip.loose = ['T-shirt', 'T-shirt', 'Jeans', 'Underwear', 'Underwear'].map((n) => ({ id: uid(), itemId: byName(n).id, compartmentId: mainOf(backpack).id }))
  return { items, bags, trips: [trip], activeTripId: trip.id, apiKey: '', packsTo: { ...DEFAULT_PACKS_TO } }
}

export const KEY = 'bin-pack.v2'
function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as State
  } catch { /* fall through to sample */ }
  return sampleState()
}

const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [...list, x])

export function useStore() {
  const [state, setState] = useState<State>(load)
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage unavailable: session-only */ }
  }, [state])
  const api = {
    set: (patch: Partial<State>) => setState((s) => ({ ...s, ...patch })),
    replace: (s: State) => setState(s),
    upsertItem: (it: Item) => setState((s) => ({ ...s, items: upsert(s.items, it) })),
    removeItem: (id: string) => setState((s) => ({ ...s, items: s.items.filter((i) => i.id !== id), trips: s.trips.map((t) => ({ ...t, placements: t.placements.filter((p) => p.itemId !== id), loose: t.loose.filter((l) => l.itemId !== id) })) })),
    /** Saves a bag and drops placements in compartments that no longer exist or no longer hold them. */
    upsertBag: (b: Bag) => setState((s) => ({
      ...s, bags: upsert(s.bags, b),
      trips: s.trips.map((t) => (t.bagId !== b.id ? t : {
        ...t,
        placements: t.placements.filter((p) => b.compartments.some((c) => c.id === p.compartmentId)),
        loose: t.loose.map((l) => (b.compartments.some((c) => c.id === l.compartmentId) ? l : { ...l, compartmentId: mainOf(b).id })),
      })),
    })),
    removeBag: (id: string) => setState((s) => ({ ...s, bags: s.bags.filter((b) => b.id !== id), trips: s.trips.map((t) => (t.bagId === id ? { ...t, bagId: null, placements: [], loose: [] } : t)) })),
    patchCompartment: (bagId: string, compId: string, patch: Partial<Compartment>) =>
      setState((s) => ({ ...s, bags: s.bags.map((b) => (b.id !== bagId ? b : { ...b, compartments: b.compartments.map((c) => (c.id === compId ? { ...c, ...patch } : c)) })) })),
    rotateCompartment: (bagId: string, compId: string) => setState((s) => {
      const bag = s.bags.find((b) => b.id === bagId)
      if (!bag) return s
      const r = rotateCompartment(bag, compId, s.trips, s.items)
      return { ...s, bags: upsert(s.bags, r.bag), trips: r.trips }
    }),
    upsertTrip: (t: Trip) => setState((s) => ({ ...s, trips: upsert(s.trips, t), activeTripId: s.activeTripId ?? t.id })),
    removeTrip: (id: string) => setState((s) => { const trips = s.trips.filter((t) => t.id !== id); return { ...s, trips, activeTripId: s.activeTripId === id ? trips[0]?.id ?? null : s.activeTripId } }),
    patchTrip: (id: string, patch: Partial<Trip> | ((t: Trip) => Partial<Trip>)) =>
      setState((s) => ({ ...s, trips: s.trips.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)) })),
  }
  return [state, api] as const
}
export type Api = ReturnType<typeof useStore>[1]
