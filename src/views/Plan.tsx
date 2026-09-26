import { Suspense, lazy, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react'
import { bagHeight, bagTotals, bagVolume, sharedTotals, dropBag, tripBags, tripReady, wornCount, isBoxed, orientationsOf, withoutPlacements, fmtDim, fmtVol, fmtW, linkedItems, mainOf, newTrip, packedCount, packedVolume, placedBoxes, uid, type Bag, type Item, type Loose, type Placement, type Worn } from '../store'
import { dropZ, faceName, fits, nextFace, oriented, volume } from '../lib/pack'
import { autoPackInto, fitOne, looseInBag, noFitReason, unitsToPack } from '../lib/packing'
import { Blank } from './Blank'
import type { PlanView, ViewProps } from '../App'
import { CAM_VIEWS, type CamView, type SceneComp } from './Scene3D'
import { CatIcon, Icon } from '../Icon'
import { ActionSelect, IconButton, Seg, Tab, TabList } from '../ui'
import { FILL_MS, useSheetSize, useTransient, useTween } from './plan/hooks'
import { NARROW, compBlock, eps, planLayout, usePackData, type PL } from './plan/data'
import { DragGhost, useDrag, type Drag, type Dropped, type Ghost } from './plan/drag'

type Mode = 'pack' | 'assemble'
type Fresh = { ids: Record<string, number>; from: Record<string, [number, number]> }
const NOT_FRESH: Fresh = { ids: {}, from: {} }

const Scene3D = lazy(() => import('./Scene3D').then((m) => ({ default: m.Scene3D })))

export const AUTOPACK_ANIM_KEY = 'bin-pack.autopack-anim'
export const autopackAnimates = () => { try { return localStorage.getItem(AUTOPACK_ANIM_KEY) !== 'off' } catch { return true } }

export function Plan({ state, api, go, view, setView, bagId, worn, show }: ViewProps & { view: PlanView; setView: (v: PlanView) => void; bagId: string | null; worn: boolean; show: (id: string) => void }) {
  const { items, bags } = state
  const trip = state.trips.find((t) => t.id === state.activeTripId) ?? null
  const bag = trip && bagId ? bags.find((b) => b.id === bagId) ?? null : null
  const tb = trip ? tripBags(trip, bags) : []
  const [mode, setMode] = useState<Mode>('pack')
  const arrangeFrom = useRef<PlanView>('plan')
  // Leaving 3D (the header's Plan/3D) ends arranging.
  useEffect(() => { if (view === 'plan' && mode === 'assemble') setMode('pack') }, [view, mode])
  const [cam, setCam] = useState<{ view: CamView; n: number }>({ view: 'iso', n: 0 })

  const sheetRef = useRef<HTMLDivElement>(null)
  const size = useSheetSize(sheetRef, trip !== null)
  const narrow = size.W > 0 && size.W <= NARROW
  const [compIdx, setCompIdx] = useState(0)
  const shownComp = bag && narrow && mode === 'pack' ? bag.compartments[Math.min(compIdx, bag.compartments.length - 1)] : null
  const layout = useMemo(() => (bag ? planLayout(size, shownComp ? [shownComp] : bag.compartments, narrow) : null), [bag, size, narrow, shownComp])

  const data = usePackData(trip, bag, items)
  const { placedList, boxesBy, looseBy, fills, containers, cubeColor, cFills } = data

  const H = bag ? bagHeight(bag) : 0
  const [cutRaw, setCutRaw] = useState<number | null>(null)
  const cut = Math.min(cutRaw ?? H, H)
  // The cut only earns its place once something sits on top of something else.
  const layered = !!bag && placedList.some((pl) => pl.box.z > 0 && bag.compartments.some((c) => c.id === pl.p.compartmentId))
  const [selected, setSelected] = useState<string | null>(null)
  // A drop that doesn't fit leaves its footprint flashing red for a moment.
  const [flash, showFlash] = useTransient<Ghost | null>(null)
  // Footprints placed in the last moment, with their order in the batch. A single drop settles; an autopack batch arrives one item at a time.
  const [fresh, showFresh] = useTransient<Fresh>(NOT_FRESH)
  const settle = (ids: string[], from?: Record<string, [number, number]>) => {
    const step = from ? 90 : 20
    showFresh({ ids: Object.fromEntries(ids.map((id, i) => [id, i * step])), from: from ?? {} }, ids.length * step + 600)
  }
  // Bars and readouts ease to new values; an autopack batch stretches that to the length of its arrival so they fill as items land.
  const [fillMs, showFillMs] = useTransient(FILL_MS)
  const stretch = (ms: number) => showFillMs(ms, ms + 100)
  // A soft item has no footprint to settle, so the compartment or container that took it flashes on the drawing instead.
  const [pulse, showPulse] = useTransient<{ home: string; n: number } | null>(null)
  const absorb = (home: string) => showPulse({ home, n: Date.now() }, 700)
  const say = api.say

  const tot = bag && trip ? bagTotals(bag, trip, items) : null
  const packedN = tot?.count ?? 0
  const totalChecks = trip?.checklist.length ?? 0
  const complete = !!trip && tripReady(trip, bags, items)
  const shared = trip ? sharedTotals(trip, bags, items) : []
  const myShare = bag ? shared.find((x) => x.bagIds.includes(bag.id)) : undefined
  const weigh = (g: number | null) => trip && bag && api.patchTrip(trip.id, (t) => { const { [bag.id]: _old, ...rest } = t.weighed ?? {}; return { weighed: g == null ? rest : { ...rest, [bag.id]: g } } })

  const matchedIds = useMemo(
    () => new Set(trip ? trip.checklist.flatMap((c) => linkedItems(c, items).map((i) => i.id)) : []),
    [trip, items],
  )
  const rows = useMemo(
    () =>
      items
        .map((it) => {
          const placedN = trip ? packedCount(trip, it.id) : 0
          return { it, placedN, wornN: trip ? wornCount(trip, it.id) : 0, remaining: Math.max(0, it.qty - placedN), onList: matchedIds.has(it.id) }
        })
        .sort((a, b) => Number(b.onList) - Number(a.onList) || a.it.name.localeCompare(b.it.name)),
    [items, trip, matchedIds],
  )
  const unmatched = trip ? trip.checklist.filter((c) => !linkedItems(c, items).length) : []

  const wornRef = useRef<HTMLButtonElement>(null)
  // Drag: the footprint appears at true scale the instant the drag starts and snaps to the 1 cm grid over a compartment.
  const onDrop = ({ drag: d, snap: sn, ghost: g, wornHit: toWorn }: Dropped) => {
    if (!trip || !d.itemId) return
    if (toWorn) {
      const w: Worn = { id: uid(), itemId: d.itemId }
      const pid = d.placementId
      api.patchTrip(trip.id, (t) => ({ ...(pid ? withoutPlacements(t, new Set([pid])) : {}), worn: [...t.worn, w] }))
      setSelected(null)
    } else if (sn?.ok && sn.soft) {
      const l: Loose = { id: uid(), itemId: d.itemId, home: sn.home }
      api.patchTrip(trip.id, (t) => ({ loose: [...t.loose, l] }))
      absorb(sn.home)
      if (sn.over) say('Over volume: more soft than the room left', true)
    } else if (sn?.ok) {
      const pl: Placement = { id: d.placementId ?? uid(), itemId: d.itemId, compartmentId: sn.compId, x: sn.x, y: sn.y, z: sn.z, o: d.o }
      api.patchTrip(trip.id, (t) => ({ placements: [...t.placements.filter((p) => p.id !== pl.id), pl] }))
      setSelected(pl.id)
      settle([pl.id])
    } else if (sn && g) {
      showFlash(g, 280)
    } else if (d.placementId) {
      // Dropped off the sheet: a placed unit comes out.
      const id = d.placementId
      api.snap(`Took out ${nameOf(d.itemId)}`)
      api.patchTrip(trip.id, (t) => withoutPlacements(t, new Set([id])))
      setSelected(null)
    }
  }
  const dragger = useDrag({ sheetRef, wornRef, items, layout, data, snapping: !!bag && view === 'plan' && mode === 'pack', onDrop })
  const { drag, wornHit } = dragger
  const startDrag = (e: RPointerEvent, d: Pick<Drag, 'itemId' | 'placementId' | 'o'>) => {
    if (e.button !== 0 || !trip) return
    setSelected(d.placementId ?? null)
    dragger.start(e, d)
  }

  const compOf = (id: string) => bag?.compartments.find((c) => c.id === id) ?? null
  const nameOf = (itemId: string) => items.find((i) => i.id === itemId)?.name ?? 'it'
  const removePl = (id: string) => { if (!trip) return; const pl = trip.placements.find((p) => p.id === id); api.snap(`Took out ${pl ? nameOf(pl.itemId) : 'it'}`); api.patchTrip(trip.id, (t) => withoutPlacements(t, new Set([id]))) }
  const removeUnit = (itemId: string) => trip && (api.snap(`Took off ${nameOf(itemId)}`), api.patchTrip(trip.id, (t) => {
    const w = [...t.worn].reverse().find((x) => x.itemId === itemId)
    if (w) return { worn: t.worn.filter((x) => x !== w) }
    const last = [...t.loose].reverse().find((l) => l.itemId === itemId)
    return { loose: t.loose.filter((l) => l !== last) }
  }))
  /** One unit of an item out of a container, back to the schedule; or everything out, keeping the container where it is. */
  const takeOut = (home: string, itemId: string) => trip && (api.snap(`Took out ${nameOf(itemId)}`), api.patchTrip(trip.id, (t) => {
    const last = [...t.loose].reverse().find((l) => l.home === home && l.itemId === itemId)
    return { loose: t.loose.filter((l) => l !== last) }
  }))
  const emptyOut = (home: string) => trip && (api.snap(`Emptied ${containers.find((c) => c.id === home)?.it.name ?? 'it'}`), api.patchTrip(trip.id, (t) => ({ loose: t.loose.filter((l) => l.home !== home) })))
  /** Re-seats a placement in a new orientation at the same corner, settling on whatever is under it. */
  const reorient = (id: string, o: number) => {
    if (!trip || !bag) return
    const pl = placedList.find((x) => x.p.id === id)
    const c = pl && compOf(pl.p.compartmentId)
    if (!pl || !c || o === pl.p.o) return
    const d = oriented(pl.it, o)
    const oth = placedList.filter((x) => x.p.id !== id && x.p.compartmentId === c.id).map((x) => x.box)
    const x = Math.min(pl.p.x, Math.max(0, c.l - d.l)), y = Math.min(pl.p.y, Math.max(0, c.w - d.w))
    const z = dropZ(oth, { x, y, l: d.l, w: d.w })
    if (!fits(c, oth, { ...d, x, y, z })) return say(`${pl.it.name} can't go ${faceName(o)} here`, true)
    api.patchTrip(trip.id, (t) => ({ placements: t.placements.map((p) => (p.id === id ? { ...p, x, y, z, o } : p)) }))
  }
  const rotatePl = (id: string) => { const pl = placedList.find((x) => x.p.id === id); if (pl) reorient(id, pl.p.o ^ 1) }
  const tipPl = (id: string) => {
    const pl = placedList.find((x) => x.p.id === id)
    if (!pl) return
    if (pl.it.up) return say(`${pl.it.name} is this side up`)
    reorient(id, nextFace(pl.p.o, orientationsOf(pl.it)))
  }
  const placeOne = (it: Item) => {
    if (!trip || !bag) return
    if (it.kind === 'soft') {
      // Chosen inside the updater so rapid clicks see each other's result.
      api.patchTrip(trip.id, (t) => ({ loose: [...t.loose, looseInBag(t, items, bag, it)] }))
      const { home } = looseInBag(trip, items, bag, it), c = compOf(home)
      absorb(home)
      if (c && (looseBy[home] ?? 0) + packedVolume(it) > fills[home].free + eps) say(`${c.name} is over volume`, true)
      return
    }
    const pl = fitOne(bag.compartments, it, boxesBy)
    if (!pl) return say(noFitReason(bag, tb.filter((b) => b.id !== bag.id), it, boxesBy), true)
    api.patchTrip(trip.id, (t) => ({ placements: [...t.placements, pl] }))
    setSelected(pl.id)
    settle([pl.id])
  }
  const putIn = (it: Item, home: string) => {
    if (!trip) return
    setSelected(null)
    if (home === 'worn') { api.patchTrip(trip.id, (t) => ({ worn: [...t.worn, { id: uid(), itemId: it.id }] })); return say(`Wearing ${it.name}`) }
    if (home.startsWith('bag:')) return packInto(it, tb.find((b) => b.id === home.slice(4)))
    if (!bag) return
    if (isBoxed(it)) {
      const c = compOf(home)
      const pl = c && fitOne([c], it, boxesBy)
      if (!pl) return say(`${it.name} has no gap big enough in ${c?.name}.`, true)
      api.patchTrip(trip.id, (t) => ({ placements: [...t.placements, pl] }))
      settle([pl.id])
      return
    }
    const pv = packedVolume(it)
    api.patchTrip(trip.id, (t) => ({ loose: [...t.loose, { id: uid(), itemId: it.id, home }] }))
    absorb(home)
    const room = cFills[home] ? cFills[home].free : (fills[home]?.free ?? 0) - (looseBy[home] ?? 0)
    if (pv > room + eps) say(`${cFills[home] ? containers.find((c) => c.id === home)?.it.name : compOf(home)?.name} is over volume`, true)
  }
  const packInto = (it: Item, to: Bag | undefined) => {
    if (!trip || !to) return
    if (isBoxed(it)) {
      const pl = fitOne(to.compartments, it, boxesBy)
      if (!pl) return say(`${it.name} doesn't fit in ${to.name}.`, true)
      api.patchTrip(trip.id, (t) => ({ placements: [...t.placements, pl] }))
    } else api.patchTrip(trip.id, (t) => ({ loose: [...t.loose, looseInBag(t, items, to, it)] }))
    say(`Packed ${it.name} in ${to.name}`)
  }
  /** A placed item goes to another bag on the trip, or onto the traveler. */
  const moveTo = (id: string, dest: string) => {
    const pl = placedList.find((x) => x.p.id === id)
    if (!trip || !pl) return
    let add: Placement | null = null
    if (dest !== 'worn') {
      // Placed against the trip as it will be once this unit has left; nothing changes if it won't fit.
      const to = tb.find((b) => b.id === dest)
      add = to ? fitOne(to.compartments, pl.it, placedBoxes({ ...trip, ...withoutPlacements(trip, new Set([id])) }, items)) : null
      if (!to || !add) return say(`${pl.it.name} doesn't fit in ${to?.name ?? 'that bag'}.`, true)
    }
    api.snap(dest === 'worn' ? `Wearing ${pl.it.name}` : `Moved ${pl.it.name} to ${tb.find((b) => b.id === dest)?.name}`)
    api.patchTrip(trip.id, (t) => {
      const r = withoutPlacements(t, new Set([id]))
      return add ? { ...r, placements: [...r.placements, add] } : { ...r, worn: [...t.worn, { id: uid(), itemId: pl.it.id }] }
    })
    setSelected(null)
  }
  const autoPackAll = () => {
    if (!trip || !bag) return
    const units = unitsToPack(trip, items)
    if (!units.length) return say(matchedIds.size ? 'Every checklist item is already in the bag' : 'Nothing left to pack')
    const { placements: add, loose, unplaced } = autoPackInto(trip, items, bag, units)
    api.patchTrip(trip.id, (t) => ({ placements: [...t.placements, ...add], loose: [...t.loose, ...loose] }))
    if (autopackAnimates() && layout) {
      // Each footprint leaves from its own schedule row: row position minus where it lands, in sheet pixels.
      const sr = sheetRef.current!.getBoundingClientRect()
      const from = Object.fromEntries(add.flatMap((p): [string, [number, number]][] => {
        const row = document.querySelector(`[data-item="${p.itemId}"]`)?.getBoundingClientRect()
        const cl = layout.comps.find((c) => c.c.id === p.compartmentId)
        return row && cl ? [[p.id, [row.left + 8 - sr.left - (cl.ox + p.x * layout.s), row.top + 8 - sr.top - (cl.oy + p.y * layout.s)]]] : []
      }))
      settle(add.map((p) => p.id), from)
      stretch(add.length * 90 + 340)
    }
    const parts = [add.length + loose.length ? `Packed ${add.length + loose.length} ${add.length + loose.length === 1 ? 'item' : 'items'}` : '', unplaced ? `${unplaced} didn't fit` : ''].filter(Boolean)
    say(parts.join(', '), unplaced > 0)
  }
  const clearAll = () => { if (trip && bag) { api.snap(`Emptied ${bag.name}`); api.patchTrip(trip.id, (t) => dropBag(bag, t)); setSelected(null) } }
  const onKey = (e: KeyboardEvent) => {
    if (!selected || drag) return
    const isComp = !!compOf(selected)
    if ((e.key === 'Delete' || e.key === 'Backspace') && !isComp) { e.preventDefault(); removePl(selected); setSelected(null) }
    if (e.key === 'r' || e.key === 'R') { if (isComp && bag) api.rotateCompartment(bag.id, selected); else rotatePl(selected) }
    if ((e.key === 't' || e.key === 'T') && !isComp) tipPl(selected)
    if (e.key === 'Escape') setSelected(null)
  }

  const scene = useMemo<SceneComp[]>(
    () => (bag ? bag.compartments.map((c) => ({ c, boxes: placedList.filter((pl) => pl.p.compartmentId === c.id).map((pl) => ({ id: pl.p.id, box: pl.box, selected: pl.p.id === selected, color: pl.it.color })), fill: fills[c.id] })) : []),
    [bag, placedList, selected, fills],
  )

  if (!trip) {
    return (
      <div className="plan">
        <div className="sheet">
          <div className="sheet-empty">
            <h2>No trip open</h2>
            <p>A trip holds the bag, the checklist, and where every item sits.</p>
            <button className="btn primary" onClick={() => { const t = newTrip(bags[0]?.id ?? null); api.upsertTrip(t); api.set({ activeTripId: t.id }); go('Trips') }}>Start a trip</button>
          </div>
        </div>
        <aside className="schedule"><div className="sch-list"><Blank art="list" title="Nothing to pack yet">A trip brings its bags and a checklist here.</Blank></div></aside>
      </div>
    )
  }

  const s = layout?.s ?? 0
  const selPl = placedList.find((pl) => pl.p.id === selected) ?? null
  const selComp = selected ? compOf(selected) : null
  const compsByZ = layout ? [...layout.comps].sort((a, b) => a.c.z - b.c.z) : []

  // Soft items can go to any compartment or container in the bag; the + becomes a short "Put in…" menu once there is a choice.
  const homes = bag ? [
    ...containers.map((c) => ({ id: c.id, name: c.it.name, free: cFills[c.id].free })),
    ...bag.compartments.map((c) => ({ id: c.id, name: c.name, free: fills[c.id].free - (looseBy[c.id] ?? 0) })),
  ] : []
  const addKey = (it: Item, remaining: number) => (
    <span className="addkey">
      <button className="btn key add" onClick={() => placeOne(it)} disabled={!remaining || !bag} aria-label={`Pack ${it.name}`} title={it.kind === 'soft' ? 'Add where there is most room' : 'Place at the best free spot'}><Icon name="plus" /></button>
      <select className="put" aria-label={`Put ${it.name} in…`} value="" disabled={!remaining} onChange={(e) => putIn(it, e.target.value)}>
        <option value="" disabled hidden>▾</option>
        {bag && (it.kind === 'soft' ? homes : bag.compartments.map((c) => ({ id: c.id, name: c.name, free: fills[c.id].free - (looseBy[c.id] ?? 0) }))).map((h) => <option key={h.id} value={h.id}>{h.name}{it.kind === 'soft' ? ` · ${fmtVol(Math.max(0, h.free))} free` : ''}</option>)}
        {tb.filter((b) => b.id !== bag?.id).map((b) => <option key={b.id} value={`bag:${b.id}`}>In {b.name}</option>)}
        <option value="worn">Wear it</option>
      </select>
    </span>
  )

  const Row = (r: (typeof rows)[number]) => (
    <div
      key={r.it.id}
      data-item={r.it.id}
      className={'row drag' + (drag && drag.itemId === r.it.id && !drag.placementId ? ' dragging' : '')}
      onPointerDown={mode === 'pack' ? (e) => { if (e.pointerType !== 'mouse' && !(e.target as Element).closest('.grip')) return; startDrag(e, { itemId: r.it.id, o: 0 }) } : undefined}
    >
      <span className="grip" aria-hidden="true"><Icon name="grip" /></span>
      <CatIcon it={r.it} />
      <span className="name"><span className="truncate">{r.it.name}</span>{r.placedN > 0 && <span className="dim">{r.placedN} of {r.it.qty}{r.wornN ? `, ${r.wornN} worn` : ''}</span>}</span>
      <span className="w num">{fmtW(r.it.weight)}</span>
      <span onPointerDown={(e) => e.stopPropagation()}>{addKey(r.it, r.remaining)}</span>
    </div>
  )

  // Heaviest units in this bag, for the over-limit readout.
  const heaviest = bag ? [...placedList.filter((pl) => bag.compartments.some((c) => c.id === pl.p.compartmentId)).map((pl) => pl.it as Item), ...trip.loose.filter((l) => homes.some((h) => h.id === l.home)).flatMap((l) => items.filter((i) => i.id === l.itemId))]
    .sort((a, b) => b.weight - a.weight).filter((it, i, xs) => xs.findIndex((x) => x.id === it.id) === i).slice(0, 2) : []
  const toPack = rows.filter((r) => r.remaining > 0 && r.onList), extra = rows.filter((r) => r.remaining > 0 && !r.onList)
  const openChecks = unmatched.filter((c) => !c.packed)
  const Tick = (c: (typeof unmatched)[number]) => (
    <label key={c.id} className="row check">
      <input type="checkbox" checked={c.packed} onChange={(e) => api.patchTrip(trip.id, (t) => ({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, packed: e.target.checked } : x)) }))} />
      <CatIcon it={c} />
      <span className="name" title="Not in your inventory: tick it off by hand"><span className="truncate">{c.label}{c.qty > 1 ? ` × ${c.qty}` : ''}</span></span>
    </label>
  )

  // What sits where: one colour block per compartment, containers nested inside the compartment that holds them.
  const group = <T extends { itemId: string }>(xs: T[]) => Object.entries(xs.reduce<Record<string, T[]>>((a, x) => ({ ...a, [x.itemId]: [...(a[x.itemId] ?? []), x] }), {}))
  const cubeSection = (c: (typeof containers)[number]) => {
    const f = cFills[c.id]
    const inside = group(trip.loose.filter((l) => l.home === c.id))
    return (
      <Block key={c.id} id={c.id} name={c.it.name} color={cubeColor[c.id]} pct={f.ratio} over={f.over} ms={fillMs}>
        {inside.map(([id, ls]) => { const it = items.find((x) => x.id === id); return it && <InRow key={id} it={it} n={ls.length} onMinus={() => takeOut(c.id, id)} label={`Take one ${it.name} out of ${c.it.name}`} /> })}
        {!inside.length && <p className="blk-empty">Empty</p>}
        {inside.length > 0 && <button className="btn text blk-act" onClick={() => emptyOut(c.id)}>Empty it</button>}
      </Block>
    )
  }
  const blocks = bag ? bag.compartments.map((c, ci) => {
    const f = fills[c.id]
    const pct = ((volume(c) - f.free) + (looseBy[c.id] ?? 0)) / volume(c)
    const pls = placedList.filter((pl) => pl.p.compartmentId === c.id && pl.it.kind !== 'container')
    const loose = trip.loose.filter((l) => l.home === c.id)
    const cubes = containers.filter((x) => x.compartmentId === c.id)
    const empty = !pls.length && !loose.length && !cubes.length
    return (
      <Block key={c.id} id={c.id} name={c.name} color={compBlock(c, ci)} pct={pct} over={f.over} ms={fillMs}>
        {group(pls.map((pl) => ({ itemId: pl.it.id, pl }))).map(([id, xs]) => (
          <InRow key={id} it={xs[0].pl.it} n={xs.length} onSelect={() => setSelected(xs[xs.length - 1].pl.p.id)} onMinus={() => { removePl(xs[xs.length - 1].pl.p.id); setSelected(null) }} label={`Take one ${xs[0].pl.it.name} out`} />
        ))}
        {group(loose).map(([id, ls]) => { const it = items.find((x) => x.id === id); return it && <InRow key={id} it={it} n={ls.length} onMinus={() => takeOut(c.id, id)} label={`Take one ${it.name} out of ${c.name}`} /> })}
        {cubes.map(cubeSection)}
        {empty && <p className="blk-empty">Empty</p>}
      </Block>
    )
  }) : []

  return (
    <div className="plan">
        {(tb.length > 0 || trip.worn.length > 0) && (
          <TabList className="bagstrip" label="Bags on this trip">
            {tb.map((b) => {
              const tab = (b: Bag) => {
                const t = bagTotals(b, trip, items)
                return (
                  <Tab key={b.id} selected={b.id === bag?.id} className={'bagtab' + (t.over || t.wState === 'over' ? ' red' : '')} onClick={() => show(b.id)}>
                    <span className="name truncate">{b.name}</span>
                    {b.id !== bag?.id && <span className="num">{fmtW(t.total)}</span>}
                  </Tab>
                )
              }
              const sh = shared.find((x) => x.bagIds.includes(b.id))
              if (!sh) return tab(b)
              // A Shared Limit draws once, at its first bag in trip order, with its bags gathered beside it.
              const members = tb.filter((x) => sh.bagIds.includes(x.id))
              if (members[0].id !== b.id) return null
              return (
                <div key={sh.id} className={'share' + (sh.over ? ' over' : '')} role="presentation">
                  <div className="share-tabs">{members.map(tab)}</div>
                  <span className="share-cap">Together {fmtW(sh.total)} of {fmtW(sh.limit)}</span>
                </div>
              )
            })}
            <Tab ref={wornRef} selected={worn} className={'bagtab wornt' + (wornHit ? ' hit' : '')} onClick={() => show('worn')} title="Drop an item here to wear it">
              <span className="name truncate">Worn</span>
              <span className="num">{trip.worn.length}</span>
            </Tab>
          </TabList>
        )}
      <div className="sheet" ref={sheetRef} tabIndex={0} onKeyDown={onKey} aria-label="Packing plan">
        {bag && layout && view === 'plan' && (
          <svg className="draw" width={size.W} height={size.H} role="img" aria-label={`${bag.name} in plan, ${packedN} items packed`}>
            <defs>
              <pattern id="g1" width={s} height={s} patternUnits="userSpaceOnUse" x={layout.comps[0].ox} y={layout.comps[0].oy}><path d={`M ${s} 0 H 0 V ${s}`} fill="none" stroke="var(--grid)" /></pattern>
              <pattern id="g10" width={s * 10} height={s * 10} patternUnits="userSpaceOnUse" x={layout.comps[0].ox} y={layout.comps[0].oy}>
                <rect width={s * 10} height={s * 10} fill="url(#g1)" />
                <path d={`M ${s * 10} 0 H 0 V ${s * 10}`} fill="none" stroke="var(--grid-major)" />
              </pattern>
              <pattern id="hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1={0} y1={0} x2={0} y2={6} stroke="var(--ink-2)" strokeWidth={0.75} /></pattern>
              <pattern id="hatch-red" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1={0} y1={0} x2={0} y2={6} stroke="var(--red)" strokeWidth={0.9} /></pattern>
            </defs>
            <rect width={size.W} height={size.H} fill="url(#g10)" onPointerDown={() => setSelected(null)} />
            {compsByZ.map(({ c, ox, oy }) => {
              const cutLocal = cut - c.z
              const inComp = placedList.filter((pl) => pl.p.compartmentId === c.id && pl.p.id !== drag?.placementId).sort((a, b) => Number(a.p.id === selected) - Number(b.p.id === selected) || a.box.z - b.box.z)
              const f = fills[c.id]
              const selC = selected === c.id
              const floor = `color-mix(in srgb, ${compBlock(c, bag.compartments.indexOf(c))} var(--floor), var(--paper))`
              return (
                <g key={c.id} className="comp">
                  <rect className="frame" x={ox} y={oy} width={c.l * s} height={c.w * s} fill={floor} stroke={selC ? 'var(--blue)' : 'var(--ink)'} strokeWidth={2} onPointerDown={() => setSelected(null)} />
                  <text className="cname" x={ox} y={oy - 12}>{c.name}<tspan className="cdim" dx={8}>{fmtDim(c)} cm</tspan></text>
                  {(looseBy[c.id] ?? 0) > 0 && (
                    <>
                      <mask id={`m-${c.id}`}>
                        <rect x={ox} y={oy} width={c.l * s} height={c.w * s} fill="#fff" />
                        {inComp.filter((pl) => pl.box.z < cutLocal - eps).map((pl) => <rect key={pl.p.id} x={ox + pl.box.x * s} y={oy + pl.box.y * s} width={pl.box.l * s} height={pl.box.w * s} fill="#000" />)}
                      </mask>
                      <rect x={ox} y={oy} width={c.l * s} height={c.w * s} fill={`url(#${f.over ? 'hatch-red' : 'hatch'})`} mask={`url(#m-${c.id})`} opacity={0.3 + 0.5 * Math.min(1, f.ratio)} pointerEvents="none" />
                    </>
                  )}
                  <g>
                    {inComp.map((pl) => (
                      <ItemRect key={pl.p.id} pl={pl} s={s} ox={ox} oy={oy} above={pl.box.z >= cutLocal - eps} selected={pl.p.id === selected} delay={fresh.ids[pl.p.id]} from={fresh.from[pl.p.id]} holds={cFills[pl.p.id]} block={cubeColor[pl.p.id]} onDown={(e) => startDrag(e, { itemId: pl.it.id, placementId: pl.p.id, o: pl.p.o })} />
                    ))}
                  </g>
                </g>
              )
            })}
            {pulse && mode === 'pack' && (() => {
              const cube = placedList.find((pl) => pl.p.id === pulse.home), cl = layout.comps.find((x) => x.c.id === (cube ? cube.p.compartmentId : pulse.home))
              if (!cl) return null
              const r = cube ? { x: cl.ox + cube.box.x * s, y: cl.oy + cube.box.y * s, w: cube.box.l * s, h: cube.box.w * s } : { x: cl.ox, y: cl.oy, w: cl.c.l * s, h: cl.c.w * s }
              return <rect key={pulse.n} className="absorb" x={r.x} y={r.y} width={r.w} height={r.h} pointerEvents="none" />
            })()}
            {selPl && !drag && layout.comps.find((cl) => cl.c.id === selPl.p.compartmentId) && (() => {
              const { ox, oy } = layout.comps.find((cl) => cl.c.id === selPl.p.compartmentId)!
              return (
                <>
                  <Dim x1={ox + selPl.box.x * s} y1={oy + (selPl.box.y + selPl.box.w) * s + 22} x2={ox + (selPl.box.x + selPl.box.l) * s} y2={oy + (selPl.box.y + selPl.box.w) * s + 22} edge={oy + (selPl.box.y + selPl.box.w) * s} label={`${selPl.box.l}`} color="var(--blue)" />
                  <Dim x1={ox + selPl.box.x * s - 22} y1={oy + selPl.box.y * s} x2={ox + selPl.box.x * s - 22} y2={oy + (selPl.box.y + selPl.box.w) * s} edge={ox + selPl.box.x * s} label={`${selPl.box.w}`} color="var(--blue)" />
                </>
              )
            })()}
          </svg>
        )}
        {bag && view === '3d' && (
          <Suspense fallback={<div className="sheet-empty"><p>Loading the 3D view…</p></div>}>
            <Scene3D comps={scene} cut={cut} cam={cam} arrange={mode === 'assemble' ? { selected: selComp?.id ?? null, onSelect: setSelected, onMove: (id, at) => api.patchCompartment(bag.id, id, at) } : undefined} />
          </Suspense>
        )}
        {bag && shownComp && bag.compartments.length > 1 && view === 'plan' && (
          <TabList className="ctabs seg" label="Compartment on the sheet">
            {bag.compartments.map((c, i) => (
              <Tab key={c.id} selected={c.id === shownComp.id} aria-pressed={c.id === shownComp.id} className={fills[c.id]?.over ? 'red' : ''} onClick={() => { setCompIdx(i); setSelected(null) }}>{c.name}</Tab>
            ))}
          </TabList>
        )}
        {/* Arranging happens in 3D, where height is visible: pick a compartment, drag an arrow, and it settles onto whatever is below it. */}
        {bag && bag.compartments.length > 1 && mode === 'pack' && (
          <div className={'mode' + (view === '3d' ? ' in3d' : '')}>
            <button className="btn text" onClick={() => { arrangeFrom.current = view; setMode('assemble'); setSelected(null); setView('3d') }}>Arrange compartments</button>
          </div>
        )}
        {mode === 'assemble' && view === '3d' && (
          <div className="notice arrange">
            <span>{selComp ? <>Drag an arrow: <b className="ax-x">red</b> along, <b className="ax-z">blue</b> across, <b className="ax-y">green</b> up to stack. It settles onto what's below.</> : 'Pick a compartment to move it.'}</span>
            <button className="btn small" onClick={() => { setMode('pack'); setSelected(null); setView(arrangeFrom.current) }}>Done</button>
          </div>
        )}
        {bag && view === '3d' && (
          <Seg label="Camera" className="cams" options={CAM_VIEWS} value={cam.view} onChange={(v) => setCam((c) => ({ view: v, n: c.n + 1 }))} />
        )}
        {bag && mode === 'pack' && (layered || view === '3d') && (
          <div className="cut">
            <span className="label" title="Show only what sits below this height">Height</span>
            <input type="range" min={0} max={H} step={1} value={cut} onChange={(e) => setCutRaw(Number(e.target.value))} aria-label="Show layers up to this height" />
            <span className="num">{cut} cm</span>
          </div>
        )}
        {selPl && !drag && (
          <div className="sel">
            <span className="sel-name"><CatIcon it={selPl.it} />{selPl.it.name}<span className="dim">{fmtDim(selPl.box)} cm</span></span>
            <button className="btn text" onClick={() => rotatePl(selPl.p.id)} title="Turn 90° (R)"><Icon name="rotate" />Turn<kbd>R</kbd></button>
            <button className="btn text" onClick={() => tipPl(selPl.p.id)} disabled={selPl.it.up} title={selPl.it.up ? 'This side up' : 'Tip onto the next face (T)'}><Icon name="tip" />Tip<kbd>T</kbd></button>
            <ActionSelect label={`Move ${selPl.it.name} to…`} placeholder="Move to…" onPick={(to) => moveTo(selPl.p.id, to)}>
              {tb.filter((b) => b.id !== bag?.id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              <option value="worn">Wear it</option>
            </ActionSelect>
            <button className="btn text" onClick={() => { removePl(selPl.p.id); setSelected(null) }} title="Take out (Delete)"><Icon name="x" />Take out</button>
          </div>
        )}
        {selComp && mode === 'assemble' && bag && (
          <div className="sel" onKeyDown={(e) => e.stopPropagation()}>
            <span className="sel-name">{selComp.name}<span className="dim">{fmtDim(selComp)} cm</span></span>
            {/* Fine control, in cm from the bag's corner. Height only chooses what it rests on; it always settles. */}
            {(['x', 'y', 'z'] as const).map((k) => (
              <label key={k} className="cin xyz" title={k === 'x' ? 'Along the length' : k === 'y' ? 'Across the width' : 'Height it rests at'}>
                <span className="label">{k === 'x' ? 'X' : k === 'y' ? 'Y' : 'Z'}</span>
                <input type="number" step={1} value={selComp[k]} onChange={(e) => api.patchCompartment(bag.id, selComp.id, { [k]: Number(e.target.value) })} aria-label={`${selComp.name} ${k === 'z' ? 'height' : k.toUpperCase()} in cm`} />
              </label>
            ))}
            <button className="btn text" onClick={() => api.rotateCompartment(bag.id, selComp.id)} title="Rotate (R)"><Icon name="rotate" />Rotate<kbd>R</kbd></button>
          </div>
        )}
        {worn && (
          <div className="worn-list" aria-label="Worn items">
            <h2>Worn</h2>
            <p className="dim">On you on the day. Counts as packed, weighs nothing in any bag.</p>
            {Object.entries(trip.worn.reduce<Record<string, number>>((a, w) => ({ ...a, [w.itemId]: (a[w.itemId] ?? 0) + 1 }), {})).map(([id, n]) => {
              const it = items.find((i) => i.id === id)
              return it ? (
                <div key={id} className="worn-row">
                  <CatIcon it={it} />
                  <span className="name"><span className="truncate">{it.name}{n > 1 ? ` × ${n}` : ''}</span></span>
                  <span className="num dim">{fmtW(it.weight * n)}</span>
                  <IconButton icon="minus" label={`Take off ${it.name}`} title="Take one off" onClick={() => removeUnit(id)} />
                </div>
              ) : null
            })}
            {!trip.worn.length && <Blank art="worn" title="Nothing worn yet">Drag an item onto the Worn tab to wear it on the day.</Blank>}
          </div>
        )}
        {!bag && !worn && (
          <div className="sheet-empty">
            <Blank art="bag" title="Choose a bag">The plan is drawn at the bag's inside size.</Blank>
            {bags.length ? (
              <ActionSelect label="Bag" placeholder="Select a bag" className="" onPick={(id) => { api.patchTrip(trip.id, (t) => ({ bagIds: [...t.bagIds, id] })); show(id) }}>
                {bags.map((b) => <option key={b.id} value={b.id}>{b.name} · {fmtDim(mainOf(b))}</option>)}
              </ActionSelect>
            ) : (
              <button className="btn primary" onClick={() => go('Bags')}>Add a bag <Icon name="arrow" /></button>
            )}
          </div>
        )}
        {complete && <Postmark />}
      </div>

      <aside className="schedule" aria-label="Packing">
        <div className="sch-list">
          {bag && tot && <Readouts bag={bag} tot={tot} share={myShare} onWeigh={weigh} ms={fillMs} heaviest={heaviest} />}
          <div className="sch-actions">
            <button className="btn primary" onClick={autoPackAll} disabled={!bag} title="Pack what the checklist still needs">Auto-pack</button>
            <button className="btn text" onClick={clearAll} disabled={!packedN}>Empty bag</button>
          </div>
          {rows.length === 0 && (
            <Blank art="list" title="Your inventory is empty">Add the things you own with a size and a weight, then pack them here.<button className={'btn' + (bag ? ' primary' : '')} onClick={() => go('Inventory')}>Add items <Icon name="arrow" /></button></Blank>
          )}
          {rows.length > 0 && totalChecks === 0 && (
            <Blank art="list" title="No checklist yet">Let the trip suggest one, or pack anything from your inventory below.<button className="btn" onClick={() => go('Trips')}>Open the trip <Icon name="arrow" /></button></Blank>
          )}
          {(toPack.length > 0 || openChecks.length > 0) && (
            <section className="sec">
              <h3>To pack <span className="count">{toPack.length + openChecks.length}</span></h3>
              {toPack.map(Row)}
              {openChecks.map(Tick)}
            </section>
          )}
          {extra.length > 0 && (
            <details className="sec more">
              <summary><h3>Other items <span className="count">{extra.length}</span></h3></summary>
              {extra.map(Row)}
            </details>
          )}
          {totalChecks > 0 && !toPack.length && !openChecks.length && <p className="all-done"><Icon name="check" />Everything on the list is packed.</p>}
          {bag && (
            <section className="sec">
              <h3>Packed</h3>
              {packedN === 0 && <Blank art="bag" title="Nothing in the bag yet">Tap + next to an item, or drag it onto the drawing.</Blank>}
              {blocks}
            </section>
          )}
          {unmatched.some((c) => c.packed) && (
            <section className="sec">
              <h3>Ticked off</h3>
              {unmatched.filter((c) => c.packed).map(Tick)}
            </section>
          )}
        </div>
      </aside>

      <DragGhost d={dragger} homeName={(id) => compOf(id)?.name ?? placedList.find((pl) => pl.p.id === id)?.it.name} />
      {flash && <div className="ghost bad flash" style={{ left: flash.left, top: flash.top, width: flash.w, height: flash.h }} aria-hidden="true" />}
    </div>
  )
}

/** One colour block: a compartment or a container, its fill, and what sits in it. Module-level so it keeps its state across updates. */
function Block({ id, name, color, pct, over, ms, children }: { id: string; name: string; color: string; pct: number; over: boolean; ms: number; children: ReactNode }) {
  return (
    <section className={'block' + (over ? ' over' : '')} style={{ '--blk': color } as CSSProperties} aria-label={name} data-home={id}>
      <header><span className="bname">{name}</span><span className="num bpct">{Math.round(pct * 100)} %</span></header>
      <Segments ratio={pct} n={10} over={over} small ms={ms} />
      {children}
    </section>
  )
}
function InRow({ it, n, onMinus, onSelect, label }: { it: Item; n: number; onMinus: () => void; onSelect?: () => void; label: string }) {
  return (
    <div className="in-row">
      <CatIcon it={it} />
      {onSelect ? <button className="in-name truncate" onClick={onSelect}>{it.name}{n > 1 ? ` × ${n}` : ''}</button> : <span className="in-name truncate">{it.name}{n > 1 ? ` × ${n}` : ''}</span>}
      <span className="num dim">{fmtW(it.weight * n)}</span>
      <IconButton icon="minus" label={label} title="Take one out" onClick={onMinus} />
    </div>
  )
}

type Holds = { n: number; ratio: number; over: boolean }
/** Greedy word wrap into at most max lines; the first line may be shorter (room for marks). An overflowing last line ends in an ellipsis. */
function wrapLabel(text: string, first: number, per: number, max: number) {
  const out: string[] = []
  let line = ''
  const cap = () => (out.length ? per : first)
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (next.length <= cap()) { line = next; continue }
    if (line) out.push(line)
    line = word
  }
  if (line) out.push(line)
  const kept = out.slice(0, max).map((l, i) => (l.length > (i ? per : first) ? l.slice(0, Math.max(1, (i ? per : first) - 1)) + '…' : l))
  if (out.length > max) { const last = kept[max - 1]; const room = (max > 1 ? per : first) - 1; kept[max - 1] = (last.length > room ? last.slice(0, Math.max(1, room)) : last) + '…' }
  return kept
}

function ItemRect({ pl, s, ox, oy, above, selected, delay, from, holds, block, onDown }: { pl: PL; s: number; ox: number; oy: number; above: boolean; selected: boolean; delay?: number; from?: [number, number]; holds?: Holds; block?: string; onDown: (e: RPointerEvent) => void }) {
  const w = pl.box.l * s, h = pl.box.w * s
  const stroke = selected ? 'var(--blue)' : above ? 'var(--ink-3)' : 'var(--ink)'
  const tint = above ? null : block ? `color-mix(in srgb, ${block} var(--bmix), var(--paper))` : pl.it.color ? `color-mix(in srgb, ${pl.it.color} var(--tint), var(--paper))` : null
  // Names wrap by word onto as many lines as the footprint holds; only the last line that fits takes an ellipsis.
  const per = Math.floor((w - 12) / 6.8), lines = wrapLabel(pl.it.name, per - (pl.it.up ? 3 : 0), per, Math.max(1, Math.floor((h - 6) / 15) - (holds && h > 36 ? 1 : 0)))
  return (
    <g className={'it' + (delay == null ? '' : from ? ' arrive' : ' settle')} style={{ transform: `translate(${ox + pl.box.x * s}px, ${oy + pl.box.y * s}px)`, '--d': `${delay ?? 0}ms` } as CSSProperties}>
      <g className="body" style={from && ({ '--from': `translate(${from[0]}px, ${from[1]}px)` } as CSSProperties)}>
      <rect width={w} height={h} fill={above ? 'none' : 'var(--raise)'} stroke={stroke} strokeWidth={selected ? 2 : 1} strokeDasharray={above ? '4 3' : undefined} onPointerDown={onDown}><title>{pl.it.name}</title></rect>
      {tint && <rect className="ink" x={0.5} y={0.5} width={Math.max(0, w - 1)} height={Math.max(0, h - 1)} fill={tint} pointerEvents="none" />}
      {holds && holds.n > 0 && !above && <rect x={3} y={3} width={Math.max(0, w - 6)} height={Math.max(0, h - 6)} fill={`url(#${holds.over ? 'hatch-red' : 'hatch'})`} opacity={0.35 + 0.65 * Math.min(1, holds.ratio)} pointerEvents="none" />}
      {w > 40 && h > 18 && <text x={6} y={16} fontSize={13} fontWeight={500} fill={above ? 'var(--ink-2)' : 'var(--ink)'}>{lines.map((l, i) => <tspan key={i} x={6} dy={i ? 15 : 0}>{l}</tspan>)}</text>}
      {holds && w > 70 && h > 36 && <text x={6} y={16 + lines.length * 15 + 1} fontSize={12} fill={holds.over ? 'var(--red)' : 'var(--ink-2)'}>{holds.n ? `${Math.round(holds.ratio * 100)} %` : 'empty'}</text>}
      {pl.it.up && w > 56 && h > 18 && <path d={`M ${w - 16} 13 v-8 m-3 3 l3-3 3 3 M ${w - 8} 13 v-8 m-3 3 l3-3 3 3`} fill="none" stroke={above ? 'var(--ink-3)' : 'var(--ink-2)'} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" aria-label="This side up" />}
      </g>
    </g>
  )
}

/** A postmark with no words: double ring and wavy cancellation bars. The trip is ready to travel. */
function Postmark() {
  const wave = (y: number) => `M 62 ${y} c 8 -5 16 -5 24 0 s 16 5 24 0 s 16 -5 24 0 s 16 5 24 0`
  return (
    <svg className="stamp" width={168} height={64} viewBox="0 0 168 64" role="status" aria-label="Ready to travel: checklist packed, every bag under its limit">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <circle cx={30} cy={32} r={26} strokeWidth={2} />
        <circle cx={30} cy={32} r={21} strokeWidth={1} />
        {[16, 24, 32, 40, 48].map((y) => <path key={y} d={wave(y)} strokeWidth={1.5} />)}
      </g>
    </svg>
  )
}

/** Architect's dimension string: hairline, 45° ticks, extension lines from the measured edge. */
function Dim({ x1, y1, x2, y2, edge, label, color = 'var(--ink)' }: { x1: number; y1: number; x2: number; y2: number; edge: number; label: string; color?: string }) {
  const t = 4
  const vertical = x1 === x2
  const textStyle = { fontStretch: '80%', letterSpacing: '0.04em' } as const
  if (vertical) {
    const ex = x1 + (x1 > edge ? 6 : -6)
    const my = (y1 + y2) / 2
    return (
      <g stroke={color} fill="none" strokeWidth={0.75}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        <line x1={edge} y1={y1} x2={ex} y2={y1} strokeWidth={0.5} />
        <line x1={edge} y1={y2} x2={ex} y2={y2} strokeWidth={0.5} />
        <line x1={x1 - t} y1={y1 + t} x2={x1 + t} y2={y1 - t} />
        <line x1={x1 - t} y1={y2 + t} x2={x1 + t} y2={y2 - t} />
        <text x={x1 - 5} y={my} fontSize={11} fill={color} stroke="none" textAnchor="middle" transform={`rotate(-90 ${x1 - 5} ${my})`} style={textStyle}>{label}</text>
      </g>
    )
  }
  const ey = y1 + (y1 < edge ? -6 : 6)
  return (
    <g stroke={color} fill="none" strokeWidth={0.75}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line x1={x1} y1={edge} x2={x1} y2={ey} strokeWidth={0.5} />
      <line x1={x2} y1={edge} x2={x2} y2={ey} strokeWidth={0.5} />
      <line x1={x1 - t} y1={y1 + t} x2={x1 + t} y2={y1 - t} />
      <line x1={x2 - t} y1={y1 + t} x2={x2 + t} y2={y1 - t} />
      <text x={(x1 + x2) / 2} y={y1 < edge ? y1 - 5 : y1 + 13} fontSize={11} fill={color} stroke="none" textAnchor="middle" style={textStyle}>{label}</text>
    </g>
  )
}

/** Segmented bar: the ratio fills whole segments left to right, the last one partly; all segments go red when over.
 *  One eased ratio drives every segment, so a change travels across the bar from its current end rather than inside each segment. */
function Segments({ ratio, n, over, small, ms = FILL_MS }: { ratio: number; n: number; over?: boolean; small?: boolean; ms?: number }) {
  const r = useTween(ratio, ms)
  return (
    <span className={'segs' + (over ? ' over' : '') + (small ? ' small' : '')} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <i key={i} style={{ '--f': Math.max(0, Math.min(1, r * n - i)) } as CSSProperties} />)}
    </span>
  )
}

const split = (w: string) => { const [n, u] = w.split(' '); return <><span className="n">{n}</span><span className="u">{u}</span></> }

/** The two numbers that decide the trip, read at a glance: weight against the limit, and how full the bag is. The bag is weighed here. */
function Readouts({ bag, tot, share, onWeigh, ms, heaviest }: { bag: Bag; tot: ReturnType<typeof bagTotals>; share?: ReturnType<typeof sharedTotals>[number]; onWeigh: (g: number | null) => void; ms: number; heaviest: Item[] }) {
  const [edit, setEdit] = useState<string | null>(null)
  const shownW = useTween(tot.total, ms), shownF = useTween(tot.fill, ms)
  const weighed = tot.actual != null
  const limit = tot.limit
  const heavy = limit != null && tot.total > limit
  const commit = () => {
    const kg = Number(edit)
    if (edit != null) onWeigh(edit.trim() === '' ? null : kg > 0 ? Math.round(kg * 1000) : tot.actual)
    setEdit(null)
  }
  return (
    <section className="readouts" aria-label={`${bag.name} totals`}>
      <div className={'ro' + (heavy ? ' over' : '')}>
        <div className="ro-head">
          <span className="label">Weight</span>
          <span className="tag">{weighed ? 'Weighed' : 'Estimate'}</span>
          {edit == null && <button className="btn key small" onClick={() => setEdit(weighed ? String(tot.actual! / 1000) : '')}>{weighed ? 'Reweigh' : 'Weigh'}</button>}
        </div>
        {edit != null ? (
          // Keys stay in the field: the sheet reads Backspace, R and T as commands on the selected item.
          <label className="weigh" onKeyDown={(e) => e.stopPropagation()}>
            <input type="number" inputMode="decimal" min={0} step={0.01} autoFocus value={edit} placeholder={(tot.estimate / 1000).toFixed(2)} aria-label="Actual weight in kg"
              onChange={(e) => setEdit(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.dataset.cancel = '1'; if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }}
              onBlur={(e) => (e.currentTarget.dataset.cancel ? setEdit(null) : commit())} />
            <span className="u">kg</span>
          </label>
        ) : <div className="readout num">{split(fmtW(shownW))}</div>}
        <p className="ro-sub">
          {limit == null ? 'No weight limit' : heavy ? <><b>{fmtW(tot.total - limit)} over</b> the {fmtW(limit)} limit</> : <>of {fmtW(limit)} · <b>{fmtW(limit - tot.total)} left</b></>}
          {weighed && <> · estimate {fmtW(tot.estimate)}</>}
        </p>
        {heavy && heaviest.length > 0 && <p className="ro-sub">Heaviest here: {heaviest.map((i) => `${i.name} ${fmtW(i.weight)}`).join(', ')}</p>}
        {limit != null && <Segments ratio={tot.total / limit} n={Math.min(24, Math.max(6, Math.ceil(limit / 1000)))} over={heavy} ms={ms} />}
      </div>
      <div className={'ro' + (tot.over ? ' over' : '')}>
        <div className="ro-head"><span className="label">Space</span></div>
        <div className="readout num">{split(`${Math.round(shownF * 100)} %`)}</div>
        <p className="ro-sub">{tot.over ? <><b>Over volume</b> in a compartment</> : <><b>{fmtVol(Math.max(0, bagVolume(bag) * (1 - shownF)))} left</b></>}</p>
        <Segments ratio={tot.fill} n={10} over={tot.over} ms={ms} />
      </div>
      {share && (
        <div className={'ro-share' + (share.over ? ' over' : '')}>
          <span>With {share.members.filter((b) => b.id !== bag.id).map((b) => b.name).join(', ')}: <b className="num">{fmtW(share.total)}</b> of {fmtW(share.limit)}</span>
          <Segments ratio={share.total / share.limit} n={12} over={share.over} small ms={ms} />
        </div>
      )}
    </section>
  )
}
