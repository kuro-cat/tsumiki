import { useMemo, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { bagTotals, bagVolume, fmtVol, fmtW, fromShown, linkedItems, packedCount, sharedTotals, shownUnit, toShown, wornCount, type Api, type Bag, type Item, type Trip } from '../../store'
import { volume } from '../../lib/pack'
import type { Tab } from '../../App'
import { CatIcon, Icon } from '../../Icon'
import { IconButton } from '../../ui'
import { Blank } from '../Blank'
import { FILL_MS, useTween } from './hooks'
import { compBlock, type Mode, type PackData } from './data'
import type { Drag } from './drag'

/** The side panel: the bag's two readouts, what is left to pack, and what sits where. */
export function Schedule({ trip, bag, items, tb, data, tot, myShare, fillMs, drag, mode, api, go, weigh, autoPackAll, clearAll, placeOne, putIn, startDrag, setSelected, removePl, takeOut, emptyOut }: {
  trip: Trip; bag: Bag | null; items: Item[]; tb: Bag[]; data: PackData; tot: ReturnType<typeof bagTotals> | null; myShare?: ReturnType<typeof sharedTotals>[number]
  fillMs: number; drag: Drag | null; mode: Mode; api: Api; go: (t: Tab) => void; weigh: (g: number | null) => void
  autoPackAll: () => void; clearAll: () => void; placeOne: (it: Item) => void; putIn: (it: Item, home: string) => void
  startDrag: (e: RPointerEvent, d: { itemId: string; o: number }) => void; setSelected: (id: string | null) => void
  removePl: (id: string) => void; takeOut: (home: string, itemId: string) => void; emptyOut: (home: string) => void
}) {
  const { placedList, looseBy, fills, containers, cubeColor, cFills } = data
  const packedN = tot?.count ?? 0
  const totalChecks = trip.checklist.length
  const matchedIds = useMemo(() => new Set(trip.checklist.flatMap((c) => linkedItems(c, items).map((i) => i.id))), [trip, items])
  const rows = useMemo(
    () =>
      items
        .map((it) => {
          const placedN = packedCount(trip, it.id)
          return { it, placedN, wornN: wornCount(trip, it.id), remaining: Math.max(0, it.qty - placedN), onList: matchedIds.has(it.id) }
        })
        .sort((a, b) => Number(b.onList) - Number(a.onList) || a.it.name.localeCompare(b.it.name)),
    [items, trip, matchedIds],
  )
  const unmatched = trip.checklist.filter((c) => !linkedItems(c, items).length)

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
  const heavy = tot.margin != null && tot.margin < 0
  const keptW = tot.reserved.weight, keptV = tot.reserved.volume
  const left = bagVolume(bag) * (1 - shownF) - keptV
  // Typed in the shown units; reweighing without a change keeps the stored grams.
  const start = weighed ? String(toShown(tot.actual! / 1000, 'kg')) : ''
  const commit = () => {
    const kg = fromShown(Number(edit), 'kg')
    if (edit != null) onWeigh(edit.trim() === '' ? null : kg > 0 && edit !== start ? Math.round(kg * 1000) : tot.actual)
    setEdit(null)
  }
  return (
    <section className="readouts" aria-label={`${bag.name} totals`}>
      <div className={'ro' + (heavy ? ' over' : '')}>
        <div className="ro-head">
          <span className="label">Weight</span>
          <span className="tag">{weighed ? 'Weighed' : 'Estimate'}</span>
          {edit == null && <button className="btn key small" onClick={() => setEdit(start)}>{weighed ? 'Reweigh' : 'Weigh'}</button>}
        </div>
        {edit != null ? (
          // Keys stay in the field: the sheet reads Backspace, R and T as commands on the selected item.
          <label className="weigh" onKeyDown={(e) => e.stopPropagation()}>
            <input type="number" inputMode="decimal" min={0} step={0.01} autoFocus value={edit} placeholder={toShown(tot.estimate / 1000, 'kg').toFixed(2)} aria-label={`Actual weight in ${shownUnit('kg')}`}
              onChange={(e) => setEdit(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.dataset.cancel = '1'; if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }}
              onBlur={(e) => (e.currentTarget.dataset.cancel ? setEdit(null) : commit())} />
            <span className="u">{shownUnit('kg')}</span>
          </label>
        ) : <div className="readout num">{split(fmtW(shownW))}</div>}
        <p className="ro-sub">
          {limit == null ? 'No weight limit' : heavy ? <><b>{fmtW(-tot.margin!)} over</b> the {fmtW(limit)} limit</> : <>of {fmtW(limit)} · <b>{fmtW(tot.margin!)} left</b></>}
          {keptW > 0 && <> · {fmtW(keptW)} kept free</>}
          {weighed && <> · estimate {fmtW(tot.estimate)}</>}
        </p>
        {heavy && heaviest.length > 0 && <p className="ro-sub">Heaviest here: {heaviest.map((i) => `${i.name} ${fmtW(i.weight)}`).join(', ')}</p>}
        {limit != null && <Segments ratio={(tot.total + keptW) / limit} n={Math.min(24, Math.max(6, Math.ceil(limit / 1000)))} over={heavy} ms={ms} />}
      </div>
      <div className={'ro' + (tot.over ? ' over' : '')}>
        <div className="ro-head"><span className="label">Space</span></div>
        <div className="readout num">{split(`${Math.round(shownF * 100)} %`)}</div>
        <p className="ro-sub">
          {tot.over ? (keptV > 0 && left < 0 ? <><b>{fmtVol(-left)} over</b> with {fmtVol(keptV)} kept free</> : <><b>Over volume</b> in a compartment</>) : <><b>{fmtVol(Math.max(0, left))} left</b>{keptV > 0 && <> · {fmtVol(keptV)} kept free</>}</>}
        </p>
        <Segments ratio={tot.fill} n={10} over={tot.over} ms={ms} />
      </div>
      {share && (
        <div className={'ro-share' + (share.over ? ' over' : '')}>
          <span>With {share.members.filter((b) => b.id !== bag.id).map((b) => b.name).join(', ')}: <b className="num">{fmtW(share.total)}</b> of {fmtW(share.limit)}{share.reserved > 0 && <> · {fmtW(share.reserved)} kept free</>}</span>
          <Segments ratio={(share.total + share.reserved) / share.limit} n={12} over={share.over} small ms={ms} />
        </div>
      )}
    </section>
  )
}
