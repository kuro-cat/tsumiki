import { Suspense, lazy, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react'
import { bagHeight, bagTotals, containerFill, dropBag, tripBags, tripReady, wornCount, wornWeight, fillOf, isBoxed, orientationsOf, placedContainers, roomiestHome, withoutPlacements, fmtDate, fmtDim, fmtSize, fmtVol, fmtW, isPacked, linkedItems, looseVolumes, mainOf, newTrip, entryUnits, nights, packedCount, packedVolume, placedBoxes, uid, type Boxed, type Compartment, type Item, type Loose, type Placement, type Worn } from '../store'
import { autoPackBins, dropZ, faceName, fits, nextFace, oriented, volume, type Placed } from '../lib/pack'
import type { PlanView, ViewProps } from '../App'
import { CAM_VIEWS, type CamView, type SceneComp } from './Scene3D'
import { Icon } from '../Icon'
import { LinkPicker } from './LinkPicker'

type Mode = 'pack' | 'assemble'
type Drag = { itemId?: string; placementId?: string; compId?: string; o: number; px: number; py: number; sx: number; sy: number; rl: number; rt: number }
type Snap = { compId: string; home: string; x: number; y: number; z: number; ok: boolean; soft: boolean; over: boolean }
type PL = { p: Placement; it: Boxed; box: Placed }
type CL = { c: Compartment; ox: number; oy: number }
type Ghost = { left: number; top: number; w: number; h: number }

const Scene3D = lazy(() => import('./Scene3D').then((m) => ({ default: m.Scene3D })))

const PAD = { l: 88, r: 84, t: 84 }
const GAP = 64
const eps = 1e-6
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
const asBox = (c: Compartment): Placed => ({ x: c.x, y: c.y, z: c.z, l: c.l, w: c.w, h: c.h })
export const AUTOPACK_ANIM_KEY = 'bin-pack.autopack-anim'
export const autopackAnimates = () => { try { return localStorage.getItem(AUTOPACK_ANIM_KEY) !== 'off' } catch { return true } }

export function Plan({ state, api, go, view, bagId, worn, show }: ViewProps & { view: PlanView; bagId: string | null; worn: boolean; show: (id: string) => void }) {
  const { items, bags } = state
  const trip = state.trips.find((t) => t.id === state.activeTripId) ?? null
  const bag = trip && bagId ? bags.find((b) => b.id === bagId) ?? null : null
  const tb = trip ? tripBags(trip, bags) : []
  const [mode, setMode] = useState<Mode>('pack')
  const [cam, setCam] = useState<{ view: CamView; n: number }>({ view: 'iso', n: 0 })

  const sheetRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ W: 0, H: 0 })
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [trip !== null])
  const padB = size.W < 700 ? 132 : 108

  // Pack mode is a schedule of rooms: compartments side by side at one scale. Assemble mode draws them where the traveler put them.
  const layout = useMemo(() => {
    if (!bag || !size.W || !size.H || !bag.compartments.length) return null
    const aw = size.W - PAD.l - PAD.r, ah = size.H - PAD.t - padB
    const cs = bag.compartments
    if (mode === 'pack') {
      const sumL = cs.reduce((a, c) => a + c.l, 0), maxW = Math.max(...cs.map((c) => c.w))
      const s = Math.min((aw - GAP * (cs.length - 1)) / sumL, ah / maxW)
      if (!(s > 0)) return null
      let x = PAD.l + (aw - (sumL * s + GAP * (cs.length - 1))) / 2
      const comps: CL[] = cs.map((c) => { const cl = { c, ox: x, oy: PAD.t + (ah - c.w * s) / 2 }; x += c.l * s + GAP; return cl })
      return { s, comps, ext: null }
    }
    const EL = Math.max(...cs.map((c) => c.x + c.l)), EW = Math.max(...cs.map((c) => c.y + c.w))
    const CL = EL + Math.max(...cs.map((c) => c.l)) * 0.5, CW = EW + Math.max(...cs.map((c) => c.w)) * 0.5
    const s = Math.min(aw / CL, ah / CW)
    if (!(s > 0)) return null
    const ox = PAD.l + (aw - CL * s) / 2, oy = PAD.t + (ah - CW * s) / 2
    return { s, comps: cs.map((c) => ({ c, ox: ox + c.x * s, oy: oy + c.y * s })), ext: { ox, oy, EL, EW, CL, CW } }
  }, [bag, size, padB, mode])

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
  const containers = useMemo(() => (trip && bag ? placedContainers(trip, items).filter((c) => bag.compartments.some((x) => x.id === c.compartmentId)) : []), [trip, items, bag])
  const cFills = useMemo(() => Object.fromEntries(containers.map((c) => [c.id, { ...containerFill(c.it, looseBy[c.id] ?? 0), n: trip?.loose.filter((l) => l.home === c.id).length ?? 0 }])), [containers, looseBy, trip])

  const H = bag ? bagHeight(bag) : 0
  const [cutRaw, setCutRaw] = useState<number | null>(null)
  const cut = Math.min(cutRaw ?? H, H)
  const [selected, setSelected] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [flash, setFlash] = useState<Ghost | null>(null)
  // Footprints placed in the last moment, with their order in the batch. A single drop fades its wash in; an autopack batch arrives one item at a time.
  const [fresh, setFresh] = useState<{ ids: Record<string, number>; from: Record<string, [number, number]> }>({ ids: {}, from: {} })
  const freshT = useRef(0)
  const settle = (ids: string[], from?: Record<string, [number, number]>) => {
    const step = from ? 90 : 20
    setFresh({ ids: Object.fromEntries(ids.map((id, i) => [id, i * step])), from: from ?? {} })
    window.clearTimeout(freshT.current)
    freshT.current = window.setTimeout(() => setFresh({ ids: {}, from: {} }), ids.length * step + 600)
  }
  const [note, setNote] = useState<{ text: string; red?: boolean } | null>(null)
  const noteT = useRef(0)
  const say = (text: string, red = false) => {
    setNote({ text, red })
    window.clearTimeout(noteT.current)
    noteT.current = window.setTimeout(() => setNote(null), 2800)
  }

  const tot = bag && trip ? bagTotals(bag, trip, items) : null
  const packedN = tot?.count ?? 0
  const done = trip ? trip.checklist.filter((c) => isPacked(c, trip, items)).length : 0
  const totalChecks = trip?.checklist.length ?? 0
  const complete = !!trip && tripReady(trip, bags, items)

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

  // Drag: the footprint appears at true scale the instant the drag starts and snaps to the 1 cm grid over a compartment.
  const dragItem = drag?.itemId ? items.find((i) => i.id === drag.itemId) ?? null : null
  const dragComp = drag?.compId && bag ? bag.compartments.find((c) => c.id === drag.compId) ?? null : null
  const dragBox = drag && dragItem && isBoxed(dragItem) ? oriented(dragItem, drag.o) : drag && dragComp ? oriented(dragComp, drag.o) : null
  const softSide = dragItem?.kind === 'soft' ? Math.cbrt(packedVolume(dragItem)) : 0
  const wornRef = useRef<HTMLButtonElement>(null)
  const wornHit = !!drag?.itemId && (() => { const r = wornRef.current?.getBoundingClientRect(); return !!r && drag.px >= r.left && drag.px <= r.right && drag.py >= r.top && drag.py <= r.bottom })()
  let snap: Snap | null = null
  if (drag && bag && layout && view === 'plan' && !wornHit) {
    const { s } = layout
    if (dragComp && dragBox && layout.ext) {
      const { ox, oy, CL, CW } = layout.ext
      const others = bag.compartments.filter((c) => c.id !== dragComp.id).map(asBox)
      const x = clamp(Math.round((drag.sx - ox) / s - dragBox.l / 2), 0, Math.max(0, CL - dragBox.l))
      const y = clamp(Math.round((drag.sy - oy) / s - dragBox.w / 2), 0, Math.max(0, CW - dragBox.w))
      snap = { compId: dragComp.id, home: dragComp.id, x, y, z: dropZ(others, { x, y, l: dragBox.l, w: dragBox.w }), ok: true, soft: false, over: false }
    } else if (dragItem && mode === 'pack') {
      const halo = 24
      const cl = layout.comps.find(({ c, ox, oy }) => drag.sx >= ox - halo && drag.sx <= ox + c.l * s + halo && drag.sy >= oy - halo && drag.sy <= oy + c.w * s + halo)
      if (cl && dragBox) {
        const others = placedList.filter((pl) => pl.p.compartmentId === cl.c.id && pl.p.id !== drag.placementId).map((pl) => pl.box)
        const x = clamp(Math.round((drag.sx - cl.ox) / s - dragBox.l / 2), 0, Math.max(0, cl.c.l - dragBox.l))
        const y = clamp(Math.round((drag.sy - cl.oy) / s - dragBox.w / 2), 0, Math.max(0, cl.c.w - dragBox.w))
        const z = dropZ(others, { x, y, l: dragBox.l, w: dragBox.w })
        snap = { compId: cl.c.id, home: cl.c.id, x, y, z, ok: fits(cl.c, others, { ...dragBox, x, y, z }), soft: false, over: false }
      } else if (cl && dragItem.kind === 'soft') {
        const pv = packedVolume(dragItem)
        const px = (drag.sx - cl.ox) / s, py = (drag.sy - cl.oy) / s
        const cube = placedList.find((pl) => pl.it.kind === 'container' && pl.p.compartmentId === cl.c.id && px >= pl.box.x && px <= pl.box.x + pl.box.l && py >= pl.box.y && py <= pl.box.y + pl.box.w)
        snap = cube
          ? { compId: cl.c.id, home: cube.p.id, x: 0, y: 0, z: 0, ok: true, soft: true, over: (looseBy[cube.p.id] ?? 0) + pv > cFills[cube.p.id].cap + eps }
          : { compId: cl.c.id, home: cl.c.id, x: 0, y: 0, z: 0, ok: true, soft: true, over: (looseBy[cl.c.id] ?? 0) + pv > fills[cl.c.id].free + eps }
      }
    }
  }
  const gs = layout?.s ?? 4
  const ghostOrigin = snap && layout ? (dragComp && layout.ext ? { ox: layout.ext.ox, oy: layout.ext.oy } : layout.comps.find((cl) => cl.c.id === snap!.compId)) : null
  const ghost: Ghost | null =
    drag && dragBox
      ? snap && !snap.soft && ghostOrigin && layout
        ? { left: drag.rl + ghostOrigin.ox + snap.x * layout.s, top: drag.rt + ghostOrigin.oy + snap.y * layout.s, w: dragBox.l * gs, h: dragBox.w * gs }
        : { left: drag.px - (dragBox.l * gs) / 2, top: drag.py - (dragBox.w * gs) / 2, w: dragBox.l * gs, h: dragBox.w * gs }
      : drag && softSide
        ? { left: drag.px - (softSide * gs) / 2, top: drag.py - (softSide * gs) / 2, w: softSide * gs, h: softSide * gs }
        : null
  const dragRef = useRef(drag); dragRef.current = drag
  const itemsRef = useRef(items); itemsRef.current = items
  const snapRef = useRef(snap); snapRef.current = snap
  const wornHitRef = useRef(wornHit); wornHitRef.current = wornHit
  const ghostRef = useRef(ghost); ghostRef.current = ghost

  const startDrag = (e: RPointerEvent, d: Pick<Drag, 'itemId' | 'placementId' | 'compId' | 'o'>) => {
    if (e.button !== 0 || !trip) return
    e.preventDefault()
    const r = sheetRef.current!.getBoundingClientRect()
    setSelected(d.placementId ?? d.compId ?? null)
    setDrag({ ...d, px: e.clientX, py: e.clientY, sx: e.clientX - r.left, sy: e.clientY - r.top, rl: r.left, rt: r.top })
  }
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging || !trip) return
    document.body.classList.add('dragging')
    const tripId = trip.id, bagId = bag?.id
    const mv = (e: PointerEvent) => {
      const r = sheetRef.current?.getBoundingClientRect()
      if (!r) return
      setDrag((d) => d && { ...d, px: e.clientX, py: e.clientY, sx: e.clientX - r.left, sy: e.clientY - r.top, rl: r.left, rt: r.top })
    }
    const up = () => {
      const d = dragRef.current, sn = snapRef.current, g = ghostRef.current
      setDrag(null)
      if (!d) return
      if (d.itemId && wornHitRef.current) {
        const w: Worn = { id: uid(), itemId: d.itemId }
        const pid = d.placementId
        api.patchTrip(tripId, (t) => ({ ...(pid ? withoutPlacements(t, new Set([pid])) : {}), worn: [...t.worn, w] }))
        setSelected(null)
      } else if (d.compId && bagId) {
        if (!sn) return
        if (d.o & 1) api.rotateCompartment(bagId, d.compId)
        api.patchCompartment(bagId, d.compId, { x: sn.x, y: sn.y, z: sn.z })
      } else if (d.itemId && sn?.ok && sn.soft) {
        const l: Loose = { id: uid(), itemId: d.itemId, home: sn.home }
        api.patchTrip(tripId, (t) => ({ loose: [...t.loose, l] }))
        if (sn.over) say('Over volume: more soft than the room left', true)
      } else if (d.itemId && sn?.ok) {
        const pl: Placement = { id: d.placementId ?? uid(), itemId: d.itemId, compartmentId: sn.compId, x: sn.x, y: sn.y, z: sn.z, o: d.o }
        api.patchTrip(tripId, (t) => ({ placements: [...t.placements.filter((p) => p.id !== pl.id), pl] }))
        setSelected(pl.id)
        settle([pl.id])
      } else if (sn && g) {
        setFlash(g)
        window.setTimeout(() => setFlash(null), 280)
      } else if (d.placementId) {
        const id = d.placementId
        api.patchTrip(tripId, (t) => withoutPlacements(t, new Set([id])))
        setSelected(null)
      }
    }
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setDrag((d) => d && { ...d, o: d.o ^ 1 })
      if (e.key === 't' || e.key === 'T') setDrag((d) => { const it = d?.itemId ? itemsRef.current.find((i) => i.id === d.itemId) : null; return d && it && isBoxed(it) ? { ...d, o: nextFace(d.o, orientationsOf(it)) } : d })
      if (e.key === 'Escape') setDrag(null)
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('keydown', key)
    return () => {
      document.body.classList.remove('dragging')
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', key)
    }
  }, [dragging]) // eslint-disable-line react-hooks/exhaustive-deps

  const compOf = (id: string) => bag?.compartments.find((c) => c.id === id) ?? null
  const removePl = (id: string) => trip && api.patchTrip(trip.id, (t) => withoutPlacements(t, new Set([id])))
  const removeUnit = (itemId: string) => trip && api.patchTrip(trip.id, (t) => {
    const w = [...t.worn].reverse().find((x) => x.itemId === itemId)
    if (w) return { worn: t.worn.filter((x) => x !== w) }
    const last = [...t.loose].reverse().find((l) => l.itemId === itemId)
    return { loose: t.loose.filter((l) => l !== last) }
  })
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
      const pv = packedVolume(it)
      // Chosen inside the updater so rapid clicks see each other's result.
      const inBagC = (t: typeof trip) => placedContainers(t, items).filter((c) => bag.compartments.some((x) => x.id === c.compartmentId))
      api.patchTrip(trip.id, (t) => ({ loose: [...t.loose, { id: uid(), itemId: it.id, home: roomiestHome(bag, inBagC(t), placedBoxes(t, items), looseVolumes(t, items), pv) }] }))
      const home = roomiestHome(bag, containers, boxesBy, looseBy, pv), c = compOf(home)
      if (c && (looseBy[home] ?? 0) + pv > fills[home].free + eps) say(`${c.name} is over volume`, true)
      return
    }
    const r = autoPackBins(bag.compartments, [{ key: it.id, box: it, os: orientationsOf(it) }], boxesBy)
    if (!r.placed.length) return say(`${it.name} doesn't fit anywhere`, true)
    const { p, o, binId } = r.placed[0]
    const pl: Placement = { id: uid(), itemId: it.id, compartmentId: binId, x: p.x, y: p.y, z: p.z, o }
    api.patchTrip(trip.id, (t) => ({ placements: [...t.placements, pl] }))
    setSelected(pl.id)
    settle([pl.id])
  }
  const autoPackAll = () => {
    if (!trip || !bag) return
    // What the list asks for: each unpacked entry's shortfall, taken from its linked items in link order, never beyond what is owned.
    const left: Record<string, number> = Object.fromEntries(rows.map((r) => [r.it.id, r.remaining]))
    const units: Item[] = matchedIds.size
      ? trip.checklist.flatMap((c) => {
          let need = Math.max(0, c.qty - entryUnits(c, trip, items))
          return linkedItems(c, items).flatMap((it) => { const n = Math.min(need, left[it.id] ?? 0); need -= n; left[it.id] -= n; return Array.from({ length: n }, () => it) })
        })
      : rows.flatMap((r) => Array.from({ length: r.remaining }, () => r.it))
    if (!units.length) return say(matchedIds.size ? 'Every checklist item is already in the bag' : 'Nothing left to pack')
    const boxes = units.flatMap((it, i) => (isBoxed(it) ? [{ key: `${it.id}:${i}`, box: it, os: orientationsOf(it) }] : []))
    const res = autoPackBins(bag.compartments, boxes, boxesBy)
    const add: Placement[] = res.placed.map((x) => ({ id: uid(), itemId: x.key.split(':')[0], compartmentId: x.binId, x: x.p.x, y: x.p.y, z: x.p.z, o: x.o }))
    const next = { ...trip, placements: [...trip.placements, ...add] }
    const after = placedBoxes(next, items), cubes = placedContainers(next, items).filter((c) => bag.compartments.some((x) => x.id === c.compartmentId))
    const vols = { ...looseBy }
    const loose: Loose[] = units.flatMap((it) => {
      if (it.kind !== 'soft') return []
      const pv = packedVolume(it)
      const home = roomiestHome(bag, cubes, after, vols, pv)
      vols[home] = (vols[home] ?? 0) + pv
      return [{ id: uid(), itemId: it.id, home }]
    })
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
    }
    const parts = [add.length ? `${add.length} placed` : '', loose.length ? `${loose.length} loose` : '', res.unplaced.length ? `${res.unplaced.length} won't fit` : ''].filter(Boolean)
    say(parts.join(', '), res.unplaced.length > 0)
  }
  const clearAll = () => { if (trip && bag) { api.patchTrip(trip.id, (t) => dropBag(bag, t)); setSelected(null) } }
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
            <button className="btn" onClick={() => { const t = newTrip(bags[0]?.id ?? null); api.upsertTrip(t); api.set({ activeTripId: t.id }) }}>Start a trip</button>
          </div>
        </div>
        <aside className="schedule" />
      </div>
    )
  }

  const s = layout?.s ?? 0
  const selPl = placedList.find((pl) => pl.p.id === selected) ?? null
  const selComp = selected ? compOf(selected) : null
  const onList = rows.filter((r) => r.onList), others = rows.filter((r) => !r.onList)
  const compsByZ = layout ? [...layout.comps].sort((a, b) => a.c.z - b.c.z) : []

  const Row = (r: (typeof rows)[number]) => (
    <div
      key={r.it.id}
      data-item={r.it.id}
      className={'row' + (r.remaining ? ' drag' : ' spent') + (drag && drag.itemId === r.it.id && !drag.placementId ? ' dragging' : '')}
      onPointerDown={r.remaining && mode === 'pack' ? (e) => startDrag(e, { itemId: r.it.id, o: 0 }) : undefined}
    >
      <span className="grip">{r.remaining ? <Icon name="grip" /> : <Icon name="check" />}</span>
      <span className="name"><span>{r.it.color && <i className="sw" style={{ '--sw': r.it.color } as CSSProperties} />}<span>{r.it.name}</span></span><span className="dim">{r.it.kind === 'soft' ? `soft · ${fmtVol(packedVolume(r.it))} packed` : fmtSize(r.it)}{r.wornN ? ` · ${r.wornN} worn` : ''}</span></span>
      <span className="w num">{fmtW(r.it.weight)}</span>
      {r.it.qty > 8 ? <span className="num dim">{r.placedN} / {r.it.qty}</span> : (
        <span className="marks" role="img" aria-label={`${r.placedN} of ${r.it.qty} packed`}>{Array.from({ length: r.it.qty }, (_, i) => <i key={i} className={i < r.placedN ? 'on' : ''} />)}</span>
      )}
      <span className="acts" onPointerDown={(e) => e.stopPropagation()}>
        {(r.it.kind === 'soft' || r.wornN > 0) && <button className="btn quiet" onClick={() => removeUnit(r.it.id)} disabled={!r.placedN} aria-label={`Take one ${r.it.name} out`} title={r.wornN ? 'Take one off' : 'Take one out'}><Icon name="minus" /></button>}
        <button className="btn quiet" onClick={() => placeOne(r.it)} disabled={!r.remaining || !bag} aria-label={`Pack ${r.it.name}`} title={r.it.kind === 'soft' ? 'Add to the roomiest compartment' : 'Place at the best free spot'}><Icon name="plus" /></button>
      </span>
    </div>
  )

  return (
    <div className="plan">
      <div className="sheet" ref={sheetRef} tabIndex={0} onKeyDown={onKey} aria-label="Packing plan">
        {bag && layout && view === 'plan' && (
          <svg className="draw" width={size.W} height={size.H} role="img" aria-label={`${bag.name} in ${mode === 'pack' ? 'plan' : 'assembly'}, ${packedN} items packed`}>
            <defs>
              <pattern id="g1" width={s} height={s} patternUnits="userSpaceOnUse" x={layout.ext?.ox ?? layout.comps[0].ox} y={layout.ext?.oy ?? layout.comps[0].oy}><path d={`M ${s} 0 H 0 V ${s}`} fill="none" stroke="var(--grid)" /></pattern>
              <pattern id="g10" width={s * 10} height={s * 10} patternUnits="userSpaceOnUse" x={layout.ext?.ox ?? layout.comps[0].ox} y={layout.ext?.oy ?? layout.comps[0].oy}>
                <rect width={s * 10} height={s * 10} fill="url(#g1)" />
                <path d={`M ${s * 10} 0 H 0 V ${s * 10}`} fill="none" stroke="var(--grid-major)" />
              </pattern>
              <pattern id="hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1={0} y1={0} x2={0} y2={6} stroke="var(--ink-3)" strokeWidth={0.75} /></pattern>
              <pattern id="hatch-red" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1={0} y1={0} x2={0} y2={6} stroke="var(--red)" strokeWidth={0.9} /></pattern>
            </defs>
            <rect width={size.W} height={size.H} fill="url(#g10)" onPointerDown={() => setSelected(null)} />
            {layout.ext && (
              <>
                <Dim x1={layout.ext.ox} y1={layout.ext.oy - 40} x2={layout.ext.ox + layout.ext.EL * s} y2={layout.ext.oy - 40} edge={layout.ext.oy} label={`${layout.ext.EL} cm`} />
                <Dim x1={layout.ext.ox + layout.ext.CL * s + 44} y1={layout.ext.oy} x2={layout.ext.ox + layout.ext.CL * s + 44} y2={layout.ext.oy + layout.ext.EW * s} edge={layout.ext.ox + layout.ext.CL * s} label={`${layout.ext.EW} cm`} />
              </>
            )}
            {compsByZ.map(({ c, ox, oy }) => {
              const cutLocal = cut - c.z
              const inComp = placedList.filter((pl) => pl.p.compartmentId === c.id && pl.p.id !== drag?.placementId).sort((a, b) => a.box.z - b.box.z)
              const f = fills[c.id]
              const assembling = mode === 'assemble'
              const hidden = assembling && drag?.compId === c.id
              const selC = selected === c.id
              return (
                <g key={c.id} className="comp" style={{ opacity: hidden ? 0.25 : 1 }}>
                  <rect className={'frame' + (assembling ? ' grab' : '')} x={ox} y={oy} width={c.l * s} height={c.w * s} fill={assembling ? 'var(--paper)' : 'none'} stroke={selC ? 'var(--blue)' : 'var(--ink)'} strokeWidth={2}
                    onPointerDown={assembling ? (e) => startDrag(e, { compId: c.id, o: 0 }) : () => setSelected(null)} />
                  {!assembling && (
                    <>
                      <text className="cname" x={ox} y={oy - 60}>{c.name}</text>
                      <Dim x1={ox} y1={oy - 40} x2={ox + c.l * s} y2={oy - 40} edge={oy} label={`${c.l} cm`} />
                      <Dim x1={ox + c.l * s + 44} y1={oy} x2={ox + c.l * s + 44} y2={oy + c.w * s} edge={ox + c.l * s} label={`${c.w} cm`} />
                    </>
                  )}
                  {(looseBy[c.id] ?? 0) > 0 && (
                    <>
                      <mask id={`m-${c.id}`}>
                        <rect x={ox} y={oy} width={c.l * s} height={c.w * s} fill="#fff" />
                        {inComp.filter((pl) => pl.box.z < cutLocal - eps).map((pl) => <rect key={pl.p.id} x={ox + pl.box.x * s} y={oy + pl.box.y * s} width={pl.box.l * s} height={pl.box.w * s} fill="#000" />)}
                      </mask>
                      <rect x={ox} y={oy} width={c.l * s} height={c.w * s} fill={`url(#${f.over ? 'hatch-red' : 'hatch'})`} mask={`url(#m-${c.id})`} opacity={0.35 + 0.65 * Math.min(1, f.ratio)} pointerEvents="none" />
                    </>
                  )}
                  <g style={{ pointerEvents: assembling ? 'none' : undefined }}>
                    {inComp.map((pl) => (
                      <ItemRect key={pl.p.id} pl={pl} s={s} ox={ox} oy={oy} above={pl.box.z >= cutLocal - eps} selected={pl.p.id === selected} delay={fresh.ids[pl.p.id]} from={fresh.from[pl.p.id]} holds={cFills[pl.p.id]} onDown={(e) => startDrag(e, { itemId: pl.it.id, placementId: pl.p.id, o: pl.p.o })} />
                    ))}
                  </g>
                  {assembling && (
                    <text className="cname" x={ox} y={oy - 8} style={{ pointerEvents: 'none' }}>{c.name} · {fmtDim(c)} · z {c.z}</text>
                  )}
                </g>
              )
            })}
            {mode === 'assemble' && compsByZ.slice(0, -1).map(({ c, ox, oy }) => (
              <rect key={`o-${c.id}`} x={ox} y={oy} width={c.l * s} height={c.w * s} fill="none" stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />
            ))}
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
        {bag && view === '3d' && <Suspense fallback={<div className="sheet-empty"><p>Loading the 3D view…</p></div>}><Scene3D comps={scene} cut={cut} cam={cam} /></Suspense>}
        {bag && view === 'plan' && (
          <div className="mode seg" role="group" aria-label="Sheet mode">
            <button aria-pressed={mode === 'pack'} onClick={() => { setMode('pack'); setSelected(null) }}>Pack</button>
            <button aria-pressed={mode === 'assemble'} onClick={() => { setMode('assemble'); setSelected(null) }}>Assemble</button>
          </div>
        )}
        {bag && view === '3d' && (
          <div className="cams seg" role="group" aria-label="Camera">
            {CAM_VIEWS.map((v) => <button key={v} aria-pressed={cam.view === v} onClick={() => setCam((c) => ({ view: v, n: c.n + 1 }))}>{v}</button>)}
          </div>
        )}
        {bag && (
          <div className="cut">
            <span className="label">Cut</span>
            <input type="range" min={0} max={H} step={1} value={cut} onChange={(e) => setCutRaw(Number(e.target.value))} aria-label="Section cut height" />
            <span className="num">{cut} cm</span>
          </div>
        )}
        {selPl && !drag && (
          <div className="sel">
            <span>{selPl.it.name}</span>
            <span className="dim">{fmtDim(selPl.box)} · {fmtW(selPl.it.weight)} · {compOf(selPl.p.compartmentId)?.name} · base {selPl.box.z} cm · {faceName(selPl.p.o)}{cFills[selPl.p.id] ? ` · holds ${cFills[selPl.p.id].n}, ${Math.round(cFills[selPl.p.id].ratio * 100)} %` : ''}</span>
            <button className="btn quiet" onClick={() => rotatePl(selPl.p.id)} title="Turn 90° (R)"><Icon name="rotate" />Turn</button>
            <button className="btn quiet" onClick={() => tipPl(selPl.p.id)} disabled={selPl.it.up} title={selPl.it.up ? 'This side up' : 'Tip onto the next face (T)'}><Icon name="tip" />Tip</button>
            <button className="btn quiet" onClick={() => { removePl(selPl.p.id); setSelected(null) }} title="Remove (Delete)"><Icon name="x" />Remove</button>
          </div>
        )}
        {selComp && !drag && mode === 'assemble' && bag && (
          <div className="sel">
            <span>{selComp.name}</span>
            <span className="dim">{fmtDim(selComp)} cm · at {selComp.x}, {selComp.y}, z {selComp.z}</span>
            <button className="btn quiet" onClick={() => api.rotateCompartment(bag.id, selComp.id)} title="Rotate (R)"><Icon name="rotate" />Rotate</button>
          </div>
        )}
        {note && <div className={'note' + (note.red ? ' red' : '')} role="status">{note.text}</div>}
        {worn && (
          <div className="worn-list" aria-label="Worn items">
            <h2>Worn</h2>
            <p className="dim">On your body or in your pockets. Counts as packed; weighs nothing in any bag.</p>
            {Object.entries(trip.worn.reduce<Record<string, number>>((a, w) => ({ ...a, [w.itemId]: (a[w.itemId] ?? 0) + 1 }), {})).map(([id, n]) => {
              const it = items.find((i) => i.id === id)
              return it ? (
                <div key={id} className="worn-row">
                  <span className="name">{it.color && <i className="sw" style={{ '--sw': it.color } as CSSProperties} />}<span>{it.name}{n > 1 ? ` × ${n}` : ''}</span></span>
                  <span className="num dim">{fmtW(it.weight * n)}</span>
                  <button className="btn quiet" onClick={() => removeUnit(id)} aria-label={`Take off ${it.name}`}><Icon name="minus" />Take off</button>
                </div>
              ) : null
            })}
            {!trip.worn.length && <p className="dim">Nothing yet. Drag an item onto the Worn tab.</p>}
            <p className="num label">{trip.worn.length} items · {fmtW(wornWeight(trip, items))}</p>
          </div>
        )}
        {bag ? (
          <div className="tb" aria-label="Title block">
            <div className="cell wide"><span className="label">Trip</span><span className="v">{trip.name}</span><span className="sub">{trip.destination ? `${trip.destination} · ` : ''}{fmtDate(trip.start)} – {fmtDate(trip.end)} · {nights(trip)} nights</span></div>
            <div className="cell wide bag-w"><span className="label">Bag</span><span className="v">{bag.name}</span><span className="sub">{fmtDim(mainOf(bag))} cm{bag.compartments.length > 1 ? ` · ${bag.compartments.length} compartments` : ''} · {fmtW(bag.empty)} empty</span></div>
            <div className="cell scale"><span className="label">Scale</span>{layout && <ScaleBar s={layout.s} />}</div>
            <div className="cell rule items"><span className="label">Items · {tot!.count}</span><span className="v num">{fmtW(tot!.itemsW)}</span></div>
            <div className="cell total"><span className="label">Total</span><span className="v num">{fmtW(tot!.total)}</span></div>
            <div className="cell"><span className="label">Limit</span><span className="v num">{tot!.limit == null ? '—' : fmtW(tot!.limit)}</span></div>
            <div className="cell"><span className="label">Margin</span><span className={'v num' + (tot!.margin != null && tot!.margin < 0 ? ' red' : '')}>{tot!.margin == null ? '—' : (tot!.margin < 0 ? '−' : '') + fmtW(Math.abs(tot!.margin))}</span></div>
            <div className="cell"><span className="label">Fill</span><span className={'v num' + (tot!.over ? ' red' : '')}>{Math.round(tot!.fill * 100)} %</span></div>
            <div className="cell"><span className="label">Weight</span><span className="v state"><StateMark s={tot!.wState} />{tot!.wState}</span></div>
            <div className="gauges" role="group" aria-label="Fill by compartment">
              {bag.compartments.map((c) => {
                const f = fills[c.id]
                const pct = ((volume(c) - f.free) + (looseBy[c.id] ?? 0)) / volume(c)
                return (
                  <div key={c.id} className={'gauge' + (f.over ? ' over' : '')}>
                    <span className="label">{c.name}</span>
                    <i className="bar"><b style={{ transform: `scaleX(${Math.min(1, pct)})` }} /></i>
                    <span className="v num">{Math.round(pct * 100)} %</span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : worn ? null : (
          <div className="sheet-empty">
            <h2>Choose a bag</h2>
            <p>The plan is drawn at the bag's interior dimensions.</p>
            {bags.length ? (
              <select aria-label="Bag" value="" onChange={(e) => { if (e.target.value) { api.patchTrip(trip.id, (t) => ({ bagIds: [...t.bagIds, e.target.value] })); show(e.target.value) } }}>
                <option value="">Select a bag</option>
                {bags.map((b) => <option key={b.id} value={b.id}>{b.name} · {fmtDim(mainOf(b))}</option>)}
              </select>
            ) : (
              <button className="btn" onClick={() => go('Bags')}>Add a bag <Icon name="arrow" /></button>
            )}
          </div>
        )}
        {complete && <Postmark />}
      </div>

      <aside className="schedule" aria-label="Item schedule">
        <div className="sch-head">
          <h2>Schedule</h2>
          <span className="dim">{trip.name}</span>
          <div className="right">
            <button className="btn" onClick={autoPackAll} disabled={!bag} title="Pack the remaining checklist items">Auto-pack</button>
            <button className="btn quiet" onClick={clearAll} disabled={!packedN}>Clear</button>
          </div>
        </div>
        {(tb.length > 0 || trip.worn.length > 0) && (
          <div className="bagstrip" role="tablist" aria-label="Bags on this trip">
            {tb.map((b) => {
              const t = bagTotals(b, trip, items)
              return (
                <button key={b.id} role="tab" aria-selected={b.id === bag?.id} className={'bagtab' + (t.over || t.wState === 'over' ? ' red' : '')} onClick={() => show(b.id)}>
                  <span className="name">{b.name}</span>
                  <span className="num">{fmtW(t.total)}</span>
                  <StateMark s={t.wState} />
                  <span className="num dim">{Math.round(t.fill * 100)} %</span>
                </button>
              )
            })}
            <button ref={wornRef} role="tab" aria-selected={worn} className={'bagtab wornt' + (wornHit ? ' hit' : '')} onClick={() => show('worn')} title="Drop an item here to wear it">
              <span className="name">Worn</span>
              <span className="num">{trip.worn.length}</span>
              <span className="num dim">{fmtW(wornWeight(trip, items))}</span>
            </button>
          </div>
        )}
        <div className="prog">
          <span className="label">Checklist</span>
          <div className={'prog-bar' + (totalChecks && done === totalChecks ? ' done' : '')} role="progressbar" aria-valuemin={0} aria-valuemax={totalChecks} aria-valuenow={done}><i style={{ transform: `scaleX(${totalChecks ? done / totalChecks : 0})` }} /></div>
          <span className="num">{done} / {totalChecks}</span>
        </div>
        <div className="sch-list">
          {rows.length === 0 && (
            <div className="sch-empty">
              <p>Inventory is empty. Items need a size and a weight before they can be packed.</p>
              <button className="btn" onClick={() => go('Inventory')}>Add items <Icon name="arrow" /></button>
            </div>
          )}
          {rows.length > 0 && totalChecks === 0 && (
            <div className="sch-empty">
              <p>No checklist yet. Drag anything in, or let the trip suggest one.</p>
              <button className="btn quiet" onClick={() => go('Trips')}>Open trip <Icon name="arrow" /></button>
            </div>
          )}
          {mode === 'assemble' && view === 'plan' && <div className="sch-empty"><p>Assemble mode: drag compartments into place on the sheet. Switch back to Pack to place items.</p></div>}
          {onList.length > 0 && <div className="grp label">On the checklist</div>}
          {onList.map(Row)}
          {others.length > 0 && (onList.length > 0 || unmatched.length > 0) && <div className="grp label">Other inventory</div>}
          {others.map(Row)}
          {unmatched.length > 0 && <div className="grp label">On the checklist, not in inventory</div>}
          {unmatched.map((c) => (
            <div key={c.id} className="row check">
              <label>
                <input type="checkbox" checked={c.packed} onChange={(e) => api.patchTrip(trip.id, (t) => ({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, packed: e.target.checked } : x)) }))} />
                <span className="name"><span>{c.label}{c.qty > 1 ? ` × ${c.qty}` : ''}</span><span className="dim">{c.note ?? 'Tick when packed, link it, or add it to inventory'}</span></span>
              </label>
              <span className="acts" onPointerDown={(e) => e.stopPropagation()}>
                <LinkPicker entry={c} items={items} compact onChange={(itemIds) => api.patchTrip(trip.id, (t) => ({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, itemIds } : x)) }))} />
                <button className="btn quiet" onClick={() => go('Inventory')} aria-label={`Add ${c.label} to inventory`} title="Add to inventory"><Icon name="plus" /></button>
              </span>
            </div>
          ))}
        </div>
      </aside>

      {ghost && drag && (dragItem || dragComp) && (
        <div className={'ghost' + (snap && !snap.ok ? ' bad' : '') + (dragItem?.kind === 'soft' ? ' soft' : '') + (snap?.over ? ' over' : '')} style={{ left: ghost.left, top: ghost.top, width: ghost.w, height: ghost.h }} aria-hidden="true">
          <span>{dragItem?.name ?? dragComp?.name}</span><br />
          <span className="dim">
            {wornHit ? 'worn' : dragItem?.kind === 'soft'
              ? snap ? (snap.over ? 'over volume' : snap.home !== snap.compId ? `into ${placedList.find((pl) => pl.p.id === snap!.home)?.it.name}` : `loose in ${compOf(snap.compId)?.name}`) : `${fmtVol(packedVolume(dragItem))} packed`
              : dragBox ? `${dragBox.l} × ${dragBox.w} · ${snap ? (snap.ok ? `base ${snap.z} cm` : "doesn't fit") : dragItem?.kind === 'rigid' && !dragItem.up ? 'R turns · T tips' : 'R turns'}` : ''}
          </span>
        </div>
      )}
      {flash && <div className="ghost bad flash" style={{ left: flash.left, top: flash.top, width: flash.w, height: flash.h }} aria-hidden="true" />}
    </div>
  )
}

type Holds = { n: number; ratio: number; over: boolean }
function ItemRect({ pl, s, ox, oy, above, selected, delay, from, holds, onDown }: { pl: PL; s: number; ox: number; oy: number; above: boolean; selected: boolean; delay?: number; from?: [number, number]; holds?: Holds; onDown: (e: RPointerEvent) => void }) {
  const w = pl.box.l * s, h = pl.box.w * s
  const stroke = selected ? 'var(--blue)' : above ? 'var(--ink-3)' : 'var(--ink)'
  const tint = !above && pl.it.color ? `color-mix(in srgb, ${pl.it.color} var(--tint), var(--paper))` : null
  const chars = Math.floor((w - 12) / 6.8)
  const name = pl.it.name.length > chars ? pl.it.name.slice(0, Math.max(0, chars - 1)) + '…' : pl.it.name
  return (
    <g className={'it' + (delay == null ? '' : from ? ' arrive' : ' settle')} style={{ transform: `translate(${ox + pl.box.x * s}px, ${oy + pl.box.y * s}px)`, '--d': `${delay ?? 0}ms` } as CSSProperties}>
      <g className="body" style={from && ({ '--from': `translate(${from[0]}px, ${from[1]}px)` } as CSSProperties)}>
      <rect width={w} height={h} fill={above ? 'none' : 'var(--paper)'} stroke={stroke} strokeWidth={selected ? 1.5 : 1} strokeDasharray={above ? '4 3' : undefined} onPointerDown={onDown} />
      {tint && <rect className="ink" x={0.5} y={0.5} width={Math.max(0, w - 1)} height={Math.max(0, h - 1)} fill={tint} pointerEvents="none" />}
      {holds && holds.n > 0 && !above && <rect x={3} y={3} width={Math.max(0, w - 6)} height={Math.max(0, h - 6)} fill={`url(#${holds.over ? 'hatch-red' : 'hatch'})`} opacity={0.35 + 0.65 * Math.min(1, holds.ratio)} pointerEvents="none" />}
      {holds && w > 70 && h > 48 && <text x={6} y={41} fontSize={10} fill={holds.over ? 'var(--red)' : 'var(--ink-2)'} style={{ fontStretch: '80%', letterSpacing: '0.03em' }}>{holds.n ? `${holds.n} inside · ${Math.round(holds.ratio * 100)} %` : 'empty'}</text>}
      {w > 40 && h > 18 && <text x={6} y={14} fontSize={12} fill={above ? 'var(--ink-2)' : 'var(--ink)'}>{name}</text>}
      {w > 70 && h > 34 && <text x={6} y={27} fontSize={10} fill="var(--ink-2)" style={{ fontStretch: '80%', letterSpacing: '0.03em' }}>{pl.box.l} × {pl.box.w} × {pl.box.h}</text>}
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

/** A drawn scale bar: the only scale statement a screen can honestly make. */
function ScaleBar({ s }: { s: number }) {
  const cm = 10 * s > 80 ? 5 : 10
  const w = cm * s
  return (
    <svg width={w + 2} height={22} aria-label={`Scale bar, ${cm} centimetres`}>
      <g stroke="var(--ink)" strokeWidth={1} fill="none">
        <line x1={1} y1={16} x2={w + 1} y2={16} />
        <line x1={1} y1={11} x2={1} y2={21} />
        <line x1={w + 1} y1={11} x2={w + 1} y2={21} />
        {Array.from({ length: cm - 1 }, (_, i) => <line key={i} x1={1 + (i + 1) * s} y1={13.5} x2={1 + (i + 1) * s} y2={18.5} strokeWidth={0.5} />)}
      </g>
      <text x={1} y={8} fontSize={10} fill="var(--ink-2)" style={{ fontStretch: '80%', letterSpacing: '0.04em' }}>0</text>
      <text x={w + 1} y={8} fontSize={10} fill="var(--ink-2)" textAnchor="end" style={{ fontStretch: '80%', letterSpacing: '0.04em' }}>{cm} cm</text>
    </svg>
  )
}

/** Four weight states as line marks, so colour is never the only signal. */
function StateMark({ s }: { s: string }) {
  const red = 'var(--red)', ink = 'var(--ink)'
  return (
    <svg width={28} height={10} aria-hidden="true">
      {s === 'no limit' && <line x1={0} y1={5} x2={28} y2={5} stroke={ink} strokeDasharray="3 3" />}
      {s === 'light' && <line x1={0} y1={5} x2={28} y2={5} stroke={ink} strokeWidth={1} />}
      {s === 'balanced' && <line x1={0} y1={5} x2={28} y2={5} stroke={ink} strokeWidth={2.5} />}
      {s === 'near limit' && <><line x1={0} y1={3} x2={28} y2={3} stroke={ink} strokeWidth={1.5} /><line x1={0} y1={7.5} x2={28} y2={7.5} stroke={ink} strokeWidth={1.5} /></>}
      {s === 'over' && <g stroke={red} strokeWidth={1.2}><line x1={0} y1={9} x2={9} y2={1} /><line x1={9} y1={9} x2={18} y2={1} /><line x1={18} y1={9} x2={27} y2={1} /></g>}
    </svg>
  )
}
