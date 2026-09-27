import { Suspense, lazy, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react'
import { bagHeight, bagTotals, sharedTotals, dropBag, tripBags, tripReady, isBoxed, orientationsOf, withoutPlacements, fmtDim, len, lenUnit, linkedItems, mainOf, newTrip, packedVolume, uid, type Bag, type Item, type Loose, type Placement, type Worn } from '../store'
import { dropZ, faceName, fits, nextFace, oriented } from '../lib/pack'
import { autoPackInto, fitOne, looseInBag, moveInto, noFitReason, unitsToPack } from '../lib/packing'
import { Blank } from './Blank'
import type { PlanView, ViewProps } from '../App'
import { CAM_VIEWS, type CamView, type SceneComp } from './Scene3D'
import { Icon } from '../Icon'
import { ActionSelect, Seg, Tab, TabList } from '../ui'
import { FILL_MS, useSheetSize, useTransient } from './plan/hooks'
import { NARROW, eps, planLayout, usePackData, type Mode, type PL } from './plan/data'
import { DragGhost, useDrag, type Drag, type Dropped, type Ghost } from './plan/drag'
import { NOT_FRESH, Postmark, Sheet, type Fresh } from './plan/Sheet'
import { Schedule } from './plan/Schedule'
import { BagStrip } from './plan/BagStrip'
import { CompartmentBar, ItemBar } from './plan/SelectionBar'
import { WornList } from './plan/WornList'
import { autopackAnimates } from '../prefs'

const Scene3D = lazy(() => import('./Scene3D').then((m) => ({ default: m.Scene3D })))

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
  const { placedList, boxesBy, looseBy, fills, containers, cFills } = data

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
  const complete = !!trip && tripReady(trip, bags, items)
  const shared = trip ? sharedTotals(trip, bags, items) : []
  const myShare = bag ? shared.find((x) => x.bagIds.includes(bag.id)) : undefined
  const weigh = (g: number | null) => trip && bag && api.patchTrip(trip.id, (t) => { const { [bag.id]: _old, ...rest } = t.weighed ?? {}; return { weighed: g == null ? rest : { ...rest, [bag.id]: g } } })

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
  /** A placed item goes to another bag on the trip, or onto the traveler. A packing cube moves with what it holds. */
  const moveTo = (id: string, dest: string) => {
    const pl = placedList.find((x) => x.p.id === id)
    if (!trip || !pl) return
    if (dest === 'worn') {
      api.snap(`Wearing ${pl.it.name}`)
      api.patchTrip(trip.id, (t) => ({ ...withoutPlacements(t, new Set([id])), worn: [...t.worn, { id: uid(), itemId: pl.it.id }] }))
    } else {
      const to = tb.find((b) => b.id === dest)
      const moved = to ? moveInto(trip, items, id, to) : null
      if (!to || !moved) return say(`${pl.it.name} doesn't fit in ${to?.name ?? 'that bag'}.`, true)
      api.snap(`Moved ${pl.it.name} to ${to.name}`)
      api.patchTrip(trip.id, (t) => ({ placements: t.placements.map((p) => (p.id === id ? moved : p)) }))
    }
    setSelected(null)
  }
  const autoPackAll = () => {
    if (!trip || !bag) return
    const units = unitsToPack(trip, items)
    if (!units.length) return say(trip.checklist.some((c) => linkedItems(c, items).length) ? 'Every checklist item is already in the bag' : 'Nothing left to pack')
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
  // Pressing an item on the drawing selects it and gives the sheet focus, so R, T and Delete reach it. (Starting a drag prevents the default focus.)
  const pressItem = (e: RPointerEvent, pl: PL) => {
    startDrag(e, { itemId: pl.it.id, placementId: pl.p.id, o: pl.p.o })
    // focusVisible keeps the keyboard focus ring off for a mouse press; TypeScript's DOM types don't list it yet.
    sheetRef.current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
  }
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

  const selPl = placedList.find((pl) => pl.p.id === selected) ?? null
  const selComp = selected ? compOf(selected) : null

  return (
    <div className="plan">
      <BagStrip trip={trip} items={items} tb={tb} bag={bag} shared={shared} worn={worn} wornRef={wornRef} wornHit={wornHit} show={show} />
      <div className="sheet" ref={sheetRef} tabIndex={0} onKeyDown={onKey} aria-label="Packing plan">
        {bag && layout && view === 'plan' && (
          <Sheet bag={bag} layout={layout} size={size} data={data} cut={cut} selected={selected} hidden={drag?.placementId} fresh={fresh} pulse={mode === 'pack' ? pulse : null} selPl={drag ? null : selPl} packedN={packedN}
            onClear={() => setSelected(null)} onItemDown={pressItem} />
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
            <span className="num">{len(cut)} {lenUnit()}</span>
          </div>
        )}
        {selPl && !drag && <ItemBar selPl={selPl} bag={bag} tb={tb} rotatePl={rotatePl} tipPl={tipPl} moveTo={moveTo} removePl={removePl} setSelected={setSelected} />}
        {selComp && mode === 'assemble' && bag && <CompartmentBar selComp={selComp} bag={bag} api={api} />}
        {worn && <WornList trip={trip} items={items} removeUnit={removeUnit} />}
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

      <Schedule trip={trip} bag={bag} items={items} tb={tb} data={data} tot={tot} myShare={myShare} fillMs={fillMs} drag={drag} mode={mode} api={api} go={go} weigh={weigh}
        autoPackAll={autoPackAll} clearAll={clearAll} placeOne={placeOne} putIn={putIn} startDrag={startDrag} setSelected={setSelected} removePl={removePl} takeOut={takeOut} emptyOut={emptyOut} />
      <DragGhost d={dragger} homeName={(id) => compOf(id)?.name ?? placedList.find((pl) => pl.p.id === id)?.it.name} />
      {flash && <div className="ghost bad flash" style={{ left: flash.left, top: flash.top, width: flash.w, height: flash.h }} aria-hidden="true" />}
    </div>
  )
}
