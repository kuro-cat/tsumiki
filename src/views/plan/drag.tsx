import { useEffect, useEffectEvent, useState, type PointerEvent as RPointerEvent, type RefObject } from 'react'
import { fmtVol, isBoxed, orientationsOf, packedVolume, type Item } from '../../store'
import { dropZ, fits, nextFace, oriented, type Box } from '../../lib/pack'
import { eps, type Layout, type PackData } from './data'

/** A drag in progress: from the schedule (itemId) or of a placed unit (placementId too). Pointer in page (px, py) and sheet (sx, sy) pixels; rl, rt is the sheet's corner. */
export type Drag = { itemId?: string; placementId?: string; o: number; px: number; py: number; sx: number; sy: number; rl: number; rt: number }
/** Where the drag would land: a grid spot in a compartment for a box, or a home for a soft item. */
export type Snap = { compId: string; home: string; x: number; y: number; z: number; ok: boolean; soft: boolean; over: boolean }
export type Ghost = { left: number; top: number; w: number; h: number }
export type Dropped = { drag: Drag; snap: Snap | null; ghost: Ghost | null; wornHit: boolean }

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
const HALO = 24

/** The footprint snaps to the 1 cm grid over a compartment (within a small halo) and settles on what it overlaps; a soft item lands in the cube under the pointer, or the compartment. */
function snapFor(drag: Drag, item: Item, box: Box | null, layout: Layout, data: PackData): Snap | null {
  const { s } = layout
  const cl = layout.comps.find(({ c, ox, oy }) => drag.sx >= ox - HALO && drag.sx <= ox + c.l * s + HALO && drag.sy >= oy - HALO && drag.sy <= oy + c.w * s + HALO)
  if (!cl) return null
  if (box) {
    const others = data.placedList.filter((pl) => pl.p.compartmentId === cl.c.id && pl.p.id !== drag.placementId).map((pl) => pl.box)
    const x = clamp(Math.round((drag.sx - cl.ox) / s - box.l / 2), 0, Math.max(0, cl.c.l - box.l))
    const y = clamp(Math.round((drag.sy - cl.oy) / s - box.w / 2), 0, Math.max(0, cl.c.w - box.w))
    const z = dropZ(others, { x, y, l: box.l, w: box.w })
    return { compId: cl.c.id, home: cl.c.id, x, y, z, ok: fits(cl.c, others, { ...box, x, y, z }), soft: false, over: false }
  }
  if (item.kind !== 'soft') return null
  const pv = packedVolume(item)
  const px = (drag.sx - cl.ox) / s, py = (drag.sy - cl.oy) / s
  const cube = data.placedList.find((pl) => pl.it.kind === 'container' && pl.p.compartmentId === cl.c.id && px >= pl.box.x && px <= pl.box.x + pl.box.l && py >= pl.box.y && py <= pl.box.y + pl.box.w)
  return cube
    ? { compId: cl.c.id, home: cube.p.id, x: 0, y: 0, z: 0, ok: true, soft: true, over: (data.looseBy[cube.p.id] ?? 0) + pv > data.cFills[cube.p.id].cap + eps }
    : { compId: cl.c.id, home: cl.c.id, x: 0, y: 0, z: 0, ok: true, soft: true, over: (data.looseBy[cl.c.id] ?? 0) + pv > data.fills[cl.c.id].free + eps }
}

/** The footprint follows the pointer at true scale from the first moment, and sits on its grid spot while one is found. A soft item is a cube of its packed volume. */
function ghostFor(drag: Drag, box: Box | null, softSide: number, snap: Snap | null, layout: Layout | null): Ghost | null {
  const gs = layout?.s ?? 4
  if (box) {
    const origin = snap && !snap.soft && layout ? layout.comps.find((cl) => cl.c.id === snap.compId) : null
    if (snap && origin && layout) return { left: drag.rl + origin.ox + snap.x * layout.s, top: drag.rt + origin.oy + snap.y * layout.s, w: box.l * gs, h: box.w * gs }
    return { left: drag.px - (box.l * gs) / 2, top: drag.py - (box.w * gs) / 2, w: box.l * gs, h: box.w * gs }
  }
  return softSide ? { left: drag.px - (softSide * gs) / 2, top: drag.py - (softSide * gs) / 2, w: softSide * gs, h: softSide * gs } : null
}

/** Dragging items onto the sheet or the Worn tab. `snapping` is whether the sheet takes drops now; `onDrop` gets where it ended. R turns and T tips while dragging, Escape cancels. */
export function useDrag({ sheetRef, wornRef, items, layout, data, snapping, onDrop }: {
  sheetRef: RefObject<HTMLElement | null>; wornRef: RefObject<HTMLElement | null>; items: Item[]; layout: Layout | null; data: PackData; snapping: boolean; onDrop: (d: Dropped) => void
}) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragItem = drag?.itemId ? items.find((i) => i.id === drag.itemId) ?? null : null
  const dragBox = drag && dragItem && isBoxed(dragItem) ? oriented(dragItem, drag.o) : null
  const softSide = dragItem?.kind === 'soft' ? Math.cbrt(packedVolume(dragItem)) : 0
  const wornHit = !!drag?.itemId && (() => { const r = wornRef.current?.getBoundingClientRect(); return !!r && drag.px >= r.left && drag.px <= r.right && drag.py >= r.top && drag.py <= r.bottom })()
  const snap = drag && dragItem && layout && snapping && !wornHit ? snapFor(drag, dragItem, dragBox, layout, data) : null
  const ghost = drag ? ghostFor(drag, dragBox, softSide, snap, layout) : null

  const at = (e: { clientX: number; clientY: number }, r: DOMRect) => ({ px: e.clientX, py: e.clientY, sx: e.clientX - r.left, sy: e.clientY - r.top, rl: r.left, rt: r.top })
  const start = (e: RPointerEvent, d: Pick<Drag, 'itemId' | 'placementId' | 'o'>) => {
    e.preventDefault()
    setDrag({ ...d, ...at(e, sheetRef.current!.getBoundingClientRect()) })
  }
  const drop = useEffectEvent(() => {
    setDrag(null)
    if (drag) onDrop({ drag, snap, ghost, wornHit })
  })
  const key = useEffectEvent((k: string) => {
    if (k === 'r' || k === 'R') setDrag((d) => d && { ...d, o: d.o ^ 1 })
    if ((k === 't' || k === 'T') && dragItem && isBoxed(dragItem)) setDrag((d) => d && { ...d, o: nextFace(d.o, orientationsOf(dragItem)) })
    if (k === 'Escape') setDrag(null)
  })
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    document.body.classList.add('dragging')
    const move = (e: PointerEvent) => {
      const r = sheetRef.current?.getBoundingClientRect()
      if (r) setDrag((d) => d && { ...d, ...at(e, r) })
    }
    const up = () => drop()
    const down = (e: KeyboardEvent) => key(e.key)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('keydown', down)
    return () => {
      document.body.classList.remove('dragging')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', down)
    }
  }, [dragging, sheetRef])
  return { drag, dragItem, dragBox, snap, ghost, wornHit, start }
}

/** The footprint under the pointer, with what it is and where it would go. `homeName` names a compartment or container by id. */
export function DragGhost({ d, homeName }: { d: ReturnType<typeof useDrag>; homeName: (id: string) => string | undefined }) {
  const { drag, dragItem: it, dragBox: box, snap, ghost, wornHit } = d
  if (!ghost || !drag || !it) return null
  let note = ''
  if (wornHit) note = 'worn'
  else if (it.kind === 'soft') note = snap ? (snap.over ? 'over volume' : `into ${homeName(snap.home)}`) : fmtVol(packedVolume(it))
  else if (box) note = `${box.l} × ${box.w}${snap && !snap.ok ? " · doesn't fit" : ''}`
  return (
    <div className={'ghost' + (snap && !snap.ok ? ' bad' : '') + (it.kind === 'soft' ? ' soft' : '') + (snap?.over ? ' over' : '')} style={{ left: ghost.left, top: ghost.top, width: ghost.w, height: ghost.h }} aria-hidden="true">
      <span>{it.name}</span><br />
      <span className="dim">{note}</span>
    </div>
  )
}
