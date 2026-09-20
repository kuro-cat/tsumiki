import { Suspense, lazy, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react'
import { fmtDate, fmtDim, fmtW, isPacked, matchItem, newTrip, nights, uid, type Item, type Placement } from '../store'
import { autoPack, dropZ, fits, oriented, volume, type Placed } from '../lib/pack'
import type { PlanView, ViewProps } from '../App'
import { Icon } from '../Icon'

type Drag = { itemId: string; placementId?: string; rot: boolean; px: number; py: number; sx: number; sy: number; rl: number; rt: number }
type Snap = { x: number; y: number; z: number; ok: boolean }
type PL = { p: Placement; it: Item; box: Placed }
type Ghost = { left: number; top: number; w: number; h: number }

const Scene3D = lazy(() => import('./Scene3D').then((m) => ({ default: m.Scene3D })))

const PAD = { l: 88, r: 84, t: 76 }
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

export function Plan({ state, api, go, view }: ViewProps & { view: PlanView }) {
  const { items, bags } = state
  const trip = state.trips.find((t) => t.id === state.activeTripId) ?? null
  const bag = trip ? bags.find((b) => b.id === trip.bagId) ?? null : null

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

  const layout = useMemo(() => {
    if (!bag || !size.W || !size.H) return null
    const aw = size.W - PAD.l - PAD.r, ah = size.H - PAD.t - padB
    const s = Math.min(aw / bag.l, ah / bag.w)
    if (!(s > 0)) return null
    return { s, ox: PAD.l + (aw - bag.l * s) / 2, oy: PAD.t + (ah - bag.w * s) / 2 }
  }, [bag, size, padB])

  const placedList = useMemo<PL[]>(
    () =>
      !trip
        ? []
        : trip.placements.flatMap((p) => {
            const it = items.find((i) => i.id === p.itemId)
            if (!it) return []
            const o = oriented(it, p.rot)
            return [{ p, it, box: { ...o, x: p.x, y: p.y, z: p.z } }]
          }),
    [trip, items],
  )

  const [cutRaw, setCutRaw] = useState<number | null>(null)
  const cut = bag ? Math.min(cutRaw ?? bag.h, bag.h) : 0
  const [selected, setSelected] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [flash, setFlash] = useState<Ghost | null>(null)
  const [note, setNote] = useState<{ text: string; red?: boolean } | null>(null)
  const noteT = useRef(0)
  const say = (text: string, red = false) => {
    setNote({ text, red })
    window.clearTimeout(noteT.current)
    noteT.current = window.setTimeout(() => setNote(null), 2800)
  }

  const itemsW = placedList.reduce((a, pl) => a + pl.it.weight, 0)
  const total = (bag?.empty ?? 0) + itemsW
  const limit = bag?.limit ?? null
  const margin = limit == null ? null : limit - total
  const ratio = limit ? total / limit : 0
  const wState = limit == null ? 'no limit' : ratio > 1 ? 'over' : ratio > 0.85 ? 'near limit' : ratio >= 0.5 ? 'balanced' : 'light'
  const fill = bag ? placedList.reduce((a, pl) => a + volume(pl.box), 0) / volume(bag) : 0
  const done = trip ? trip.checklist.filter((c) => isPacked(c, trip, items)).length : 0
  const totalChecks = trip?.checklist.length ?? 0
  const complete = !!trip && totalChecks > 0 && done === totalChecks && placedList.length > 0 && (limit == null || total <= limit)

  const matchedIds = useMemo(
    () => new Set(trip ? trip.checklist.map((c) => matchItem(c, items)?.id).filter((x): x is string => !!x) : []),
    [trip, items],
  )
  const rows = useMemo(
    () =>
      items
        .map((it) => {
          const placedN = trip ? trip.placements.filter((p) => p.itemId === it.id).length : 0
          return { it, placedN, remaining: Math.max(0, it.qty - placedN), onList: matchedIds.has(it.id) }
        })
        .sort((a, b) => Number(b.onList) - Number(a.onList) || a.it.name.localeCompare(b.it.name)),
    [items, trip, matchedIds],
  )
  const unmatched = trip ? trip.checklist.filter((c) => !matchItem(c, items)) : []

  // Drag: the footprint appears at true scale the instant the drag starts and snaps to the 1 cm grid over the bag.
  const dragItem = drag ? items.find((i) => i.id === drag.itemId) ?? null : null
  const dragBox = drag && dragItem ? oriented(dragItem, drag.rot) : null
  let snap: Snap | null = null
  if (drag && dragBox && bag && layout && view === 'plan') {
    const { s, ox, oy } = layout
    const halo = 24
    const over = drag.sx >= ox - halo && drag.sx <= ox + bag.l * s + halo && drag.sy >= oy - halo && drag.sy <= oy + bag.w * s + halo
    if (over) {
      const others = placedList.filter((pl) => pl.p.id !== drag.placementId).map((pl) => pl.box)
      const x = clamp(Math.round((drag.sx - ox) / s - dragBox.l / 2), 0, Math.max(0, bag.l - dragBox.l))
      const y = clamp(Math.round((drag.sy - oy) / s - dragBox.w / 2), 0, Math.max(0, bag.w - dragBox.w))
      const z = dropZ(others, { x, y, l: dragBox.l, w: dragBox.w })
      snap = { x, y, z, ok: fits(bag, others, { ...dragBox, x, y, z }) }
    }
  }
  const gs = layout?.s ?? 4
  const ghost: Ghost | null =
    drag && dragBox
      ? snap && layout
        ? { left: drag.rl + layout.ox + snap.x * layout.s, top: drag.rt + layout.oy + snap.y * layout.s, w: dragBox.l * gs, h: dragBox.w * gs }
        : { left: drag.px - (dragBox.l * gs) / 2, top: drag.py - (dragBox.w * gs) / 2, w: dragBox.l * gs, h: dragBox.w * gs }
      : null
  const dragRef = useRef(drag); dragRef.current = drag
  const snapRef = useRef(snap); snapRef.current = snap
  const ghostRef = useRef(ghost); ghostRef.current = ghost

  const startDrag = (e: RPointerEvent, itemId: string, placementId?: string, rot = false) => {
    if (e.button !== 0 || !trip) return
    e.preventDefault()
    const r = sheetRef.current!.getBoundingClientRect()
    setSelected(placementId ?? null)
    setDrag({ itemId, placementId, rot, px: e.clientX, py: e.clientY, sx: e.clientX - r.left, sy: e.clientY - r.top, rl: r.left, rt: r.top })
  }
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging || !trip) return
    document.body.classList.add('dragging')
    const tripId = trip.id
    const mv = (e: PointerEvent) => {
      const r = sheetRef.current?.getBoundingClientRect()
      if (!r) return
      setDrag((d) => d && { ...d, px: e.clientX, py: e.clientY, sx: e.clientX - r.left, sy: e.clientY - r.top, rl: r.left, rt: r.top })
    }
    const up = () => {
      const d = dragRef.current, sn = snapRef.current, g = ghostRef.current
      setDrag(null)
      if (!d) return
      if (sn?.ok) {
        const pl: Placement = { id: d.placementId ?? uid(), itemId: d.itemId, x: sn.x, y: sn.y, z: sn.z, rot: d.rot }
        api.patchTrip(tripId, (t) => ({ placements: [...t.placements.filter((p) => p.id !== pl.id), pl] }))
        setSelected(pl.id)
      } else if (sn && g) {
        setFlash(g)
        window.setTimeout(() => setFlash(null), 280)
      } else if (d.placementId) {
        api.patchTrip(tripId, (t) => ({ placements: t.placements.filter((p) => p.id !== d.placementId) }))
        setSelected(null)
      }
    }
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setDrag((d) => d && { ...d, rot: !d.rot })
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

  const removePl = (id: string) => trip && api.patchTrip(trip.id, (t) => ({ placements: t.placements.filter((p) => p.id !== id) }))
  const rotatePl = (id: string) => {
    if (!trip || !bag) return
    const pl = placedList.find((x) => x.p.id === id)
    if (!pl) return
    const o = oriented(pl.it, !pl.p.rot)
    const oth = placedList.filter((x) => x.p.id !== id).map((x) => x.box)
    const x = Math.min(pl.p.x, Math.max(0, bag.l - o.l)), y = Math.min(pl.p.y, Math.max(0, bag.w - o.w))
    const z = dropZ(oth, { x, y, l: o.l, w: o.w })
    if (!fits(bag, oth, { ...o, x, y, z })) return say(`${pl.it.name} can't rotate here`, true)
    api.patchTrip(trip.id, (t) => ({ placements: t.placements.map((p) => (p.id === id ? { ...p, x, y, z, rot: !p.rot } : p)) }))
  }
  const placeOne = (it: Item) => {
    if (!trip || !bag) return
    const r = autoPack(bag, [{ key: it.id, box: it }], placedList.map((pl) => pl.box))
    if (!r.placed.length) return say(`${it.name} doesn't fit anywhere`, true)
    const { p, rot } = r.placed[0]
    const pl: Placement = { id: uid(), itemId: it.id, x: p.x, y: p.y, z: p.z, rot }
    api.patchTrip(trip.id, (t) => ({ placements: [...t.placements, pl] }))
    setSelected(pl.id)
  }
  const autoPackAll = () => {
    if (!trip || !bag) return
    const targets = rows.filter((r) => r.remaining > 0 && (matchedIds.size === 0 || r.onList))
    const boxes = targets.flatMap((r) => Array.from({ length: r.remaining }, (_, i) => ({ key: `${r.it.id}:${i}`, box: r.it })))
    if (!boxes.length) return say(matchedIds.size ? 'Every checklist item is already in the bag' : 'Nothing left to pack')
    const res = autoPack(bag, boxes, placedList.map((pl) => pl.box))
    const add: Placement[] = res.placed.map((x) => ({ id: uid(), itemId: x.key.split(':')[0], x: x.p.x, y: x.p.y, z: x.p.z, rot: x.rot }))
    api.patchTrip(trip.id, (t) => ({ placements: [...t.placements, ...add] }))
    say(res.unplaced.length ? `${add.length} placed, ${res.unplaced.length} won't fit` : `${add.length} placed`, res.unplaced.length > 0)
  }
  const clearAll = () => { if (trip) { api.patchTrip(trip.id, { placements: [] }); setSelected(null) } }
  const onKey = (e: KeyboardEvent) => {
    if (!selected || drag) return
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removePl(selected); setSelected(null) }
    if (e.key === 'r' || e.key === 'R') rotatePl(selected)
    if (e.key === 'Escape') setSelected(null)
  }

  const scene = useMemo(() => placedList.map((pl) => ({ id: pl.p.id, box: pl.box, selected: pl.p.id === selected })), [placedList, selected])

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

  const s = layout?.s ?? 0, ox = layout?.ox ?? 0, oy = layout?.oy ?? 0
  const sorted = [...placedList].sort((a, b) => a.box.z - b.box.z)
  const selPl = placedList.find((pl) => pl.p.id === selected) ?? null
  const onList = rows.filter((r) => r.onList), others = rows.filter((r) => !r.onList)

  const Row = (r: (typeof rows)[number]) => (
    <div
      key={r.it.id}
      className={'row' + (r.remaining ? ' drag' : ' spent') + (drag && drag.itemId === r.it.id && !drag.placementId ? ' dragging' : '')}
      onPointerDown={r.remaining ? (e) => startDrag(e, r.it.id) : undefined}
    >
      <span className="grip">{r.remaining ? <Icon name="grip" /> : <Icon name="check" />}</span>
      <span className="name"><span>{r.it.name}</span><span className="dim">{fmtDim(r.it)} cm</span></span>
      <span className="w num">{fmtW(r.it.weight)}</span>
      {r.it.qty > 8 ? <span className="num dim">{r.placedN} / {r.it.qty}</span> : (
        <span className="marks" role="img" aria-label={`${r.placedN} of ${r.it.qty} placed`}>{Array.from({ length: r.it.qty }, (_, i) => <i key={i} className={i < r.placedN ? 'on' : ''} />)}</span>
      )}
      <button className="btn quiet" onClick={() => placeOne(r.it)} disabled={!r.remaining || !bag} aria-label={`Place ${r.it.name}`} title="Place at the best free spot" onPointerDown={(e) => e.stopPropagation()}><Icon name="plus" /></button>
    </div>
  )

  return (
    <div className="plan">
      <div className="sheet" ref={sheetRef} tabIndex={0} onKeyDown={onKey} aria-label="Packing plan">
        {bag && layout && view === 'plan' && (
          <svg className="draw" width={size.W} height={size.H} role="img" aria-label={`${bag.name} in plan, ${placedList.length} items placed`}>
            <defs>
              <pattern id="g1" width={s} height={s} patternUnits="userSpaceOnUse" x={ox} y={oy}><path d={`M ${s} 0 H 0 V ${s}`} fill="none" stroke="var(--grid)" /></pattern>
              <pattern id="g10" width={s * 10} height={s * 10} patternUnits="userSpaceOnUse" x={ox} y={oy}>
                <rect width={s * 10} height={s * 10} fill="url(#g1)" />
                <path d={`M ${s * 10} 0 H 0 V ${s * 10}`} fill="none" stroke="var(--grid-major)" />
              </pattern>
            </defs>
            <rect width={size.W} height={size.H} fill="url(#g10)" onPointerDown={() => setSelected(null)} />
            <rect x={ox} y={oy} width={bag.l * s} height={bag.w * s} fill="none" stroke="var(--ink)" strokeWidth={2} onPointerDown={() => setSelected(null)} />
            <Dim x1={ox} y1={oy - 40} x2={ox + bag.l * s} y2={oy - 40} edge={oy} label={`${bag.l} cm`} />
            <Dim x1={ox + bag.l * s + 44} y1={oy} x2={ox + bag.l * s + 44} y2={oy + bag.w * s} edge={ox + bag.l * s} label={`${bag.w} cm`} />
            {sorted.map((pl) =>
              pl.p.id === drag?.placementId ? null : (
                <ItemRect key={pl.p.id} pl={pl} s={s} ox={ox} oy={oy} above={pl.box.z >= cut - 1e-6} selected={pl.p.id === selected} onDown={(e) => startDrag(e, pl.it.id, pl.p.id, pl.p.rot)} />
              ),
            )}
            {selPl && !drag && (
              <>
                <Dim x1={ox + selPl.box.x * s} y1={oy + (selPl.box.y + selPl.box.w) * s + 22} x2={ox + (selPl.box.x + selPl.box.l) * s} y2={oy + (selPl.box.y + selPl.box.w) * s + 22} edge={oy + (selPl.box.y + selPl.box.w) * s} label={`${selPl.box.l}`} color="var(--blue)" />
                <Dim x1={ox + selPl.box.x * s - 22} y1={oy + selPl.box.y * s} x2={ox + selPl.box.x * s - 22} y2={oy + (selPl.box.y + selPl.box.w) * s} edge={ox + selPl.box.x * s} label={`${selPl.box.w}`} color="var(--blue)" />
              </>
            )}
          </svg>
        )}
        {bag && view === '3d' && <Suspense fallback={<div className="sheet-empty"><p>Loading the 3D view…</p></div>}><Scene3D bag={bag} placed={scene} cut={cut} /></Suspense>}
        {bag && (
          <div className="cut">
            <span className="label">Cut</span>
            <input type="range" min={0} max={bag.h} step={1} value={cut} onChange={(e) => setCutRaw(Number(e.target.value))} aria-label="Section cut height" />
            <span className="num">{cut} cm</span>
          </div>
        )}
        {selPl && !drag && (
          <div className="sel">
            <span>{selPl.it.name}</span>
            <span className="dim">{fmtDim(selPl.box)} · {fmtW(selPl.it.weight)} · base {selPl.box.z} cm</span>
            <button className="btn quiet" onClick={() => rotatePl(selPl.p.id)} title="Rotate (R)"><Icon name="rotate" />Rotate</button>
            <button className="btn quiet" onClick={() => { removePl(selPl.p.id); setSelected(null) }} title="Remove (Delete)"><Icon name="x" />Remove</button>
          </div>
        )}
        {note && <div className={'note' + (note.red ? ' red' : '')} role="status">{note.text}</div>}
        {bag ? (
          <div className="tb" aria-label="Title block">
            <div className="cell wide"><span className="label">Trip</span><span className="v">{trip.name}</span><span className="sub">{trip.destination ? `${trip.destination} · ` : ''}{fmtDate(trip.start)} – {fmtDate(trip.end)} · {nights(trip)} nights</span></div>
            <div className="cell wide bag-w"><span className="label">Bag</span><span className="v">{bag.name}</span><span className="sub">{fmtDim(bag)} cm · {fmtW(bag.empty)} empty</span></div>
            <div className="cell scale"><span className="label">Scale</span>{layout && <ScaleBar s={layout.s} />}</div>
            <div className="cell rule items"><span className="label">Items · {placedList.length}</span><span className="v num">{fmtW(itemsW)}</span></div>
            <div className="cell total"><span className="label">Total</span><span className="v num">{fmtW(total)}</span></div>
            <div className="cell"><span className="label">Limit</span><span className="v num">{limit == null ? '—' : fmtW(limit)}</span></div>
            <div className="cell"><span className="label">Margin</span><span className={'v num' + (margin != null && margin < 0 ? ' red' : '')}>{margin == null ? '—' : (margin < 0 ? '−' : '') + fmtW(Math.abs(margin))}</span></div>
            <div className="cell"><span className="label">Fill</span><span className="v num">{Math.round(fill * 100)} %</span></div>
            <div className="cell"><span className="label">Weight</span><span className="v state"><StateMark s={wState} />{wState}</span></div>
          </div>
        ) : (
          <div className="sheet-empty">
            <h2>Choose a bag</h2>
            <p>The plan is drawn at the bag's interior dimensions.</p>
            {bags.length ? (
              <select aria-label="Bag" value="" onChange={(e) => api.patchTrip(trip.id, { bagId: e.target.value || null })}>
                <option value="">Select a bag</option>
                {bags.map((b) => <option key={b.id} value={b.id}>{b.name} · {fmtDim(b)}</option>)}
              </select>
            ) : (
              <button className="btn" onClick={() => go('Bags')}>Add a bag <Icon name="arrow" /></button>
            )}
          </div>
        )}
        {complete && <div className="stamp" role="status">Issued for travel<small>{fmtDate(trip.start)} · {fmtW(total)}</small></div>}
      </div>

      <aside className="schedule" aria-label="Item schedule">
        <div className="sch-head">
          <h2>Schedule</h2>
          <span className="dim">{trip.name}</span>
          <div className="right">
            <button className="btn" onClick={autoPackAll} disabled={!bag} title="Place the remaining checklist items">Auto-pack</button>
            <button className="btn quiet" onClick={clearAll} disabled={!placedList.length}>Clear</button>
          </div>
        </div>
        <div className="prog">
          <span className="label">Checklist</span>
          <div className={'prog-bar' + (totalChecks && done === totalChecks ? ' done' : '')} role="progressbar" aria-valuemin={0} aria-valuemax={totalChecks} aria-valuenow={done}><i style={{ transform: `scaleX(${totalChecks ? done / totalChecks : 0})` }} /></div>
          <span className="num">{done} / {totalChecks}</span>
        </div>
        <div className="sch-list">
          {rows.length === 0 && (
            <div className="sch-empty">
              <p>Inventory is empty. Items need dimensions and a weight before they can be drawn.</p>
              <button className="btn" onClick={() => go('Inventory')}>Add items <Icon name="arrow" /></button>
            </div>
          )}
          {rows.length > 0 && totalChecks === 0 && (
            <div className="sch-empty">
              <p>No checklist yet. Drag anything in, or let the trip suggest one.</p>
              <button className="btn quiet" onClick={() => go('Trips')}>Open trip <Icon name="arrow" /></button>
            </div>
          )}
          {onList.length > 0 && <div className="grp label">On the checklist</div>}
          {onList.map(Row)}
          {others.length > 0 && (onList.length > 0 || unmatched.length > 0) && <div className="grp label">Other inventory</div>}
          {others.map(Row)}
          {unmatched.length > 0 && <div className="grp label">On the checklist, not in inventory</div>}
          {unmatched.map((c) => (
            <div key={c.id} className="row check">
              <label>
                <input type="checkbox" checked={c.packed} onChange={(e) => api.patchTrip(trip.id, (t) => ({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, packed: e.target.checked } : x)) }))} />
                <span className="name"><span>{c.label}{c.qty > 1 ? ` × ${c.qty}` : ''}</span><span className="dim">{c.note ?? 'Tick when packed, or add it to inventory to draw it'}</span></span>
              </label>
              <button className="btn quiet" onClick={() => go('Inventory')} aria-label={`Add ${c.label} to inventory`} title="Add to inventory"><Icon name="plus" /></button>
            </div>
          ))}
        </div>
      </aside>

      {ghost && dragBox && dragItem && (
        <div className={'ghost' + (snap && !snap.ok ? ' bad' : '')} style={{ left: ghost.left, top: ghost.top, width: ghost.w, height: ghost.h }} aria-hidden="true">
          <span>{dragItem.name}</span><br />
          <span className="dim">{dragBox.l} × {dragBox.w} · {snap ? (snap.ok ? `base ${snap.z} cm` : "doesn't fit") : 'R rotates'}</span>
        </div>
      )}
      {flash && <div className="ghost bad flash" style={{ left: flash.left, top: flash.top, width: flash.w, height: flash.h }} aria-hidden="true" />}
    </div>
  )
}

function ItemRect({ pl, s, ox, oy, above, selected, onDown }: { pl: PL; s: number; ox: number; oy: number; above: boolean; selected: boolean; onDown: (e: RPointerEvent) => void }) {
  const w = pl.box.l * s, h = pl.box.w * s
  const stroke = selected ? 'var(--blue)' : above ? 'var(--ink-3)' : 'var(--ink)'
  const chars = Math.floor((w - 12) / 6.8)
  const name = pl.it.name.length > chars ? pl.it.name.slice(0, Math.max(0, chars - 1)) + '…' : pl.it.name
  return (
    <g className="it" style={{ transform: `translate(${ox + pl.box.x * s}px, ${oy + pl.box.y * s}px)` }}>
      <rect width={w} height={h} fill={above ? 'none' : 'var(--paper)'} stroke={stroke} strokeWidth={selected ? 1.5 : 1} strokeDasharray={above ? '4 3' : undefined} onPointerDown={onDown} />
      {w > 40 && h > 18 && <text x={6} y={14} fontSize={12} fill={above ? 'var(--ink-2)' : 'var(--ink)'}>{name}</text>}
      {w > 70 && h > 34 && <text x={6} y={27} fontSize={10} fill="var(--ink-2)" style={{ fontStretch: '80%', letterSpacing: '0.03em' }}>{pl.box.l} × {pl.box.w} × {pl.box.h}</text>}
    </g>
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
