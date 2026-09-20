import { useEffect, useState } from 'react'
import { autoPack } from './lib/pack'
import { suggest } from './lib/suggest'

export type Category = 'clothing' | 'footwear' | 'toiletries' | 'electronics' | 'documents' | 'gear' | 'misc'
export const CATEGORIES: Category[] = ['clothing', 'footwear', 'toiletries', 'electronics', 'documents', 'gear', 'misc']
export type Item = { id: string; name: string; category: Category; l: number; w: number; h: number; weight: number; qty: number; sample?: boolean }
export type Bag = { id: string; name: string; l: number; w: number; h: number; empty: number; limit: number | null; sample?: boolean }
export type Placement = { id: string; itemId: string; x: number; y: number; z: number; rot: boolean }
export type Climate = 'hot' | 'mild' | 'cold' | 'mixed'
export const CLIMATES: Climate[] = ['hot', 'mild', 'cold', 'mixed']
export type TripKind = 'city' | 'beach' | 'outdoor' | 'business'
export const KINDS: TripKind[] = ['city', 'beach', 'outdoor', 'business']
export type CheckItem = { id: string; label: string; category: Category; qty: number; match: string[]; packed: boolean; source: 'rule' | 'ai' | 'manual'; note?: string }
export type Trip = {
  id: string; name: string; destination: string; start: string; end: string
  climate: Climate; kind: TripKind; activities: string[]
  bagId: string | null; checklist: CheckItem[]; placements: Placement[]; sample?: boolean
}
export type State = { items: Item[]; bags: Bag[]; trips: Trip[]; activeTripId: string | null; apiKey: string }

export const uid = () => Math.random().toString(36).slice(2, 10)
export const isoDate = (d: Date) => d.toISOString().slice(0, 10)
export const nights = (t: { start: string; end: string }) => Math.max(1, Math.round((Date.parse(t.end) - Date.parse(t.start)) / 86400000))
export const matchItem = (c: CheckItem, items: Item[]) => items.find((i) => c.match.some((k) => i.name.toLowerCase().includes(k)))
export const isPacked = (c: CheckItem, trip: Trip, items: Item[]) => {
  if (c.packed) return true
  const m = matchItem(c, items)
  return !!m && trip.placements.some((p) => p.itemId === m.id)
}
export const fmtW = (g: number) => (Math.abs(g) >= 1000 ? (g / 1000).toFixed(2) + ' kg' : Math.round(g) + ' g')
export const fmtDim = (b: { l: number; w: number; h: number }) => `${b.l} × ${b.w} × ${b.h}`
export const fmtDate = (s: string) => new Date(s + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Re-lays every placement of a trip into another bag in one pass. Items that no longer fit return to the schedule. */
export function repack(bag: Bag, trip: Trip, items: Item[]): Placement[] {
  const boxes = trip.placements.flatMap((p) => {
    const it = items.find((i) => i.id === p.itemId)
    return it ? [{ key: p, box: it }] : []
  })
  return autoPack(bag, boxes).placed.map((x) => ({ ...x.key, x: x.p.x, y: x.p.y, z: x.p.z, rot: x.rot }))
}

export function newTrip(bagId: string | null): Trip {
  const start = new Date(); start.setDate(start.getDate() + 7)
  const end = new Date(start); end.setDate(end.getDate() + 3)
  return { id: uid(), name: 'New trip', destination: '', start: isoDate(start), end: isoDate(end), climate: 'mild', kind: 'city', activities: [], bagId, checklist: [], placements: [] }
}

function sampleState(): State {
  const S = true
  const it = (name: string, category: Category, l: number, w: number, h: number, weight: number, qty = 1): Item => ({ id: uid(), name, category, l, w, h, weight, qty, sample: S })
  const items: Item[] = [
    it('T-shirt, folded', 'clothing', 28, 20, 3, 150, 4),
    it('Jeans', 'clothing', 30, 22, 6, 600),
    it('Shorts', 'clothing', 26, 20, 3, 220, 2),
    it('Underwear', 'clothing', 15, 10, 3, 70, 6),
    it('Socks, pair', 'clothing', 10, 8, 4, 60, 6),
    it('Light jacket', 'clothing', 30, 24, 7, 420),
    it('Sun hat', 'clothing', 30, 30, 8, 110),
    it('Sneakers, pair', 'footwear', 30, 20, 12, 700),
    it('Sandals', 'footwear', 27, 12, 8, 380),
    it('Toiletry kit', 'toiletries', 22, 12, 8, 500),
    it('Sunscreen', 'toiletries', 15, 6, 4, 210),
    it('Laptop 13"', 'electronics', 31, 22, 2, 1400),
    it('Phone charger', 'electronics', 8, 5, 3, 120),
    it('Power bank', 'electronics', 15, 7, 2, 350),
    it('Camera', 'electronics', 12, 8, 7, 500),
    it('Headphones', 'electronics', 18, 16, 6, 260),
    it('Passport', 'documents', 13, 9, 1, 40),
    it('Wallet', 'documents', 11, 9, 2, 120),
    it('Water bottle', 'gear', 25, 7, 7, 300),
    it('Sunglasses, case', 'gear', 16, 7, 6, 90),
    it('Laundry bag', 'gear', 20, 14, 2, 60),
    it('Book', 'misc', 20, 13, 3, 350),
  ]
  const bags: Bag[] = [
    { id: uid(), name: 'Travel backpack 40 L', l: 50, w: 32, h: 20, empty: 1400, limit: 10000, sample: S },
    { id: uid(), name: 'Daypack 18 L', l: 42, w: 26, h: 16, empty: 600, limit: null, sample: S },
    { id: uid(), name: 'Checked suitcase', l: 68, w: 46, h: 26, empty: 3800, limit: 23000, sample: S },
  ]
  const start = new Date(); start.setDate(start.getDate() + 14)
  const end = new Date(start); end.setDate(end.getDate() + 5)
  const trip: Trip = {
    id: uid(), name: 'Lisbon', destination: 'Lisbon, Portugal', start: isoDate(start), end: isoDate(end),
    climate: 'hot', kind: 'city', activities: ['photography'], bagId: bags[0].id, checklist: [], placements: [], sample: S,
  }
  trip.checklist = suggest({ nights: 5, climate: trip.climate, kind: trip.kind, activities: trip.activities }).map((c) => ({ ...c, id: uid(), packed: false }))
  const pre = ['Laptop 13"', 'Jeans', 'Toiletry kit', 'Sneakers, pair', 'T-shirt, folded', 'T-shirt, folded', 'Camera']
  const boxes = pre.map((n, i) => { const item = items.find((x) => x.name === n)!; return { key: `${item.id}:${i}`, box: item } })
  trip.placements = autoPack(bags[0], boxes).placed.map((x) => ({ id: uid(), itemId: x.key.split(':')[0], x: x.p.x, y: x.p.y, z: x.p.z, rot: x.rot }))
  return { items, bags, trips: [trip], activeTripId: trip.id, apiKey: '' }
}

const KEY = 'soubi.v1'
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
    removeItem: (id: string) => setState((s) => ({ ...s, items: s.items.filter((i) => i.id !== id), trips: s.trips.map((t) => ({ ...t, placements: t.placements.filter((p) => p.itemId !== id) })) })),
    upsertBag: (b: Bag) => setState((s) => ({ ...s, bags: upsert(s.bags, b) })),
    removeBag: (id: string) => setState((s) => ({ ...s, bags: s.bags.filter((b) => b.id !== id), trips: s.trips.map((t) => (t.bagId === id ? { ...t, bagId: null, placements: [] } : t)) })),
    upsertTrip: (t: Trip) => setState((s) => ({ ...s, trips: upsert(s.trips, t), activeTripId: s.activeTripId ?? t.id })),
    removeTrip: (id: string) => setState((s) => { const trips = s.trips.filter((t) => t.id !== id); return { ...s, trips, activeTripId: s.activeTripId === id ? trips[0]?.id ?? null : s.activeTripId } }),
    patchTrip: (id: string, patch: Partial<Trip> | ((t: Trip) => Partial<Trip>)) =>
      setState((s) => ({ ...s, trips: s.trips.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)) })),
  }
  return [state, api] as const
}
export type Api = ReturnType<typeof useStore>[1]
