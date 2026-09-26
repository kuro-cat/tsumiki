import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type FormEvent, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react'
import { bagVolume, fmtDim, fmtVol, fmtW, newBag, newCompartment, type Bag, type Compartment } from '../store'
import type { ViewProps } from '../App'
import { Icon } from '../Icon'
import { useSort } from './Sort'

const blank = (): Bag => ({ ...newBag('', 50, 32, 20, 1200, null) })
const PRESETS = [
  { name: 'Carry-on', l: 52, w: 36, h: 18, empty: 2500, limit: 10000 },
  { name: 'Personal item', l: 40, w: 28, h: 15, empty: 800, limit: null },
  { name: 'Checked, medium', l: 68, w: 46, h: 26, empty: 3800, limit: 23000 },
  { name: 'Daypack 20 L', l: 42, w: 26, h: 16, empty: 600, limit: null },
]
const COLS = { '--cols': 'minmax(0, 2fr) 150px 90px 90px 90px 60px' } as CSSProperties
const main = (b: Bag) => b.compartments[0]
type Num = 'l' | 'w' | 'h' | 'x' | 'y' | 'z'
const AXIS: Record<Num, string> = { l: 'L', w: 'W', h: 'D', x: 'X', y: 'Y', z: 'Z' }
const AXIS_NAME: Record<Num, string> = { l: 'length', w: 'width', h: 'depth', x: 'X position', y: 'Y position', z: 'Z position' }

export function Bags({ state, api }: ViewProps) {
  const [form, setForm] = useState<Bag>(blank)
  const [editing, setEditing] = useState(false)
  const set = <K extends keyof Bag>(k: K, v: Bag[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setComp = (id: string, patch: Partial<Compartment>) => set('compartments', form.compartments.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const numC = (id: string, k: Num) => (e: ChangeEvent<HTMLInputElement>) => setComp(id, { [k]: Number(e.target.value) })
  const addComp = () => {
    const last = form.compartments[form.compartments.length - 1]
    set('compartments', [...form.compartments, newCompartment(`Pocket ${form.compartments.length}`, 20, 12, 5, last ? last.x + last.l + 2 : 0, 0, 0)])
  }
  const cancel = () => { setForm(blank()); setEditing(false) }
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.compartments.length) return
    const { sample: _s, ...rest } = form
    api.upsertBag({ ...rest, name: form.name.trim(), compartments: form.compartments.map((c) => ({ ...c, name: c.name.trim() || 'Compartment' })) })
    cancel()
  }
  const usedBy = (id: string) => state.trips.filter((t) => t.bagIds.includes(id)).length
  const by = useSort<Bag>([
    { label: 'Name', key: (b) => b.name },
    { label: 'Main L × W × D cm', num: true, key: (b) => main(b).l * main(b).w * main(b).h },
    { label: 'Volume', num: true, key: bagVolume },
    { label: 'Empty', num: true, key: (b) => b.empty },
    { label: 'Limit', num: true, key: (b) => b.limit },
    { label: 'Trips', num: true, key: (b) => usedBy(b.id) },
  ])
  // Sorting is a view; your own order (which new trips start from) is only draggable while no column is sorted.
  const list = by.sort(state.bags)

  // Reorder by dragging the grip: the first bag is what a new trip starts with. Alt+arrows do the same from the keyboard.
  const listRef = useRef<HTMLDivElement>(null)
  const [lift, setLift] = useState<{ from: number; to: number } | null>(null)
  const liftRef = useRef(lift); liftRef.current = lift
  const grab = (e: RPointerEvent, from: number) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); setLift({ from, to: from }) }
  useEffect(() => {
    if (!lift) return
    const rows = () => [...(listRef.current?.querySelectorAll<HTMLElement>('.trow.bag') ?? [])]
    const mv = (e: PointerEvent) => {
      const mids = rows().map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 })
      let to = mids.findIndex((m) => e.clientY < m)
      if (to < 0) to = mids.length - 1
      setLift((l) => l && { ...l, to })
    }
    const up = () => { const l = liftRef.current; setLift(null); if (l && l.from !== l.to) api.moveBag(l.from, l.to) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
  }, [lift !== null]) // eslint-disable-line react-hooks/exhaustive-deps
  const keyMove = (e: KeyboardEvent, i: number) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const to = e.key === 'ArrowUp' ? i - 1 : i + 1
    if (to >= 0 && to < state.bags.length) api.moveBag(i, to)
  }
  const applyPreset = (p: (typeof PRESETS)[number]) =>
    setForm((f) => ({ ...f, empty: p.empty, limit: p.limit, name: f.name || p.name, compartments: [{ ...f.compartments[0], name: 'Main', l: p.l, w: p.w, h: p.h }, ...f.compartments.slice(1)] }))

  return (
    <section className="page">
      <div className="page-head">
        <h1>Bags</h1>
        <p className="muted">Compartments with interior dimensions, the empty weight, and the limit you pack against.</p>
        <span className="label">{state.bags.length} bags</span>
      </div>
      <form className="form" onSubmit={save} aria-label={editing ? 'Edit bag' : 'Add bag'}>
        <div className="presets">
          <span className="label">Start from</span>
          {PRESETS.map((p) => (
            <button key={p.name} type="button" className="chip" onClick={() => applyPreset(p)}>{p.name}<span className="dim">{fmtDim(p)}</span></button>
          ))}
          <span className="hint">Approximate interior sizes for the Main compartment. Check your airline's numbers and edit.</span>
        </div>
        <label className="field s6"><span className="label">Name</span><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Travel backpack 40 L" required /></label>
        <label className="field s3"><span className="label">Empty weight</span><span className="unit"><input type="number" min={0} step={10} value={form.empty} onChange={(e) => set('empty', Number(e.target.value))} required /><span className="dim">g</span></span></label>
        <label className="field s3"><span className="label">Weight limit</span><span className="unit"><input type="number" min={0} step={100} value={form.limit ?? ''} onChange={(e) => set('limit', e.target.value === '' ? null : Number(e.target.value))} placeholder="none" /><span className="dim">g</span></span></label>
        <div className="field s12">
          <span className="label">Compartments<span className="dim">cm, size then position</span></span>
          <div className="comps">
            {form.compartments.map((c, i) => (
              <div key={c.id} className="comp">
                <input type="text" value={c.name} onChange={(e) => setComp(c.id, { name: e.target.value })} aria-label="Compartment name" placeholder={i === 0 ? 'Main' : 'Pocket'} />
                {(['l', 'w', 'h', 'x', 'y', 'z'] as Num[]).map((k) => (
                  <label key={k} className={'cin' + (k === 'x' ? ' x' : '')}>
                    <span className="label">{AXIS[k]}</span>
                    <input type="number" min={k === 'x' || k === 'y' || k === 'z' ? 0 : 1} step={0.5} value={c[k]} onChange={numC(c.id, k)} aria-label={`${c.name || 'Compartment'} ${AXIS_NAME[k]}`} required />
                  </label>
                ))}
                <button type="button" className="btn quiet" onClick={() => set('compartments', form.compartments.filter((x) => x.id !== c.id))} disabled={i === 0} aria-label={`Remove ${c.name}`} title={i === 0 ? 'Every bag has a Main compartment' : 'Remove'}><Icon name="x" /></button>
              </div>
            ))}
          </div>
          <div className="tools" style={{ marginTop: 8 }}>
            <button type="button" className="btn text" onClick={addComp}><Icon name="plus" />Add compartment</button>
            <span className="hint">Measure each inside. X, Y, Z is where it sits in the assembled bag; drag them into place under Assemble on the plan.</span>
          </div>
        </div>
        <div className="form-actions">
          <button className="btn primary" type="submit">{editing ? 'Save changes' : 'Add bag'}</button>
          {editing && <button className="btn text" type="button" onClick={cancel}>Cancel</button>}
          {editing && (
            <div className="right">
              <button className="btn danger" type="button" onClick={() => { api.removeBag(form.id); cancel() }} title={usedBy(form.id) ? 'Trips using this bag will lose their placements' : undefined}>Delete bag</button>
            </div>
          )}
        </div>
      </form>
      <div className="table" ref={listRef}>
        <div className="trow head sortable" style={COLS}>{by.head}</div>
        {list.map((b) => { const i = state.bags.indexOf(b); return (
          <button key={b.id} type="button" className={'trow bag' + (lift?.from === i ? ' lift' : '') + (lift && lift.to === i && lift.from !== i ? (lift.to > lift.from ? ' drop-after' : ' drop-before') : '')} style={COLS} aria-current={editing && form.id === b.id ? 'true' : undefined} onClick={() => { setForm(b); setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }} onKeyDown={(e) => !by.sorted && keyMove(e, i)} title={by.sorted ? undefined : 'Alt+↑/↓ reorders'}>
            <span className="name">{!by.sorted && <span className="grip" onPointerDown={(e) => grab(e, i)} aria-hidden="true"><Icon name="grip" /></span>}<span>{b.name}</span>{b.compartments.length > 1 && <span className="tag">{b.compartments.length} compartments</span>}{b.sample && <span className="tag">sample</span>}</span>
            <span className="num">{fmtDim(b.compartments[0])}</span>
            <span className="num">{fmtVol(bagVolume(b))}</span>
            <span className="num">{fmtW(b.empty)}</span>
            <span className="num">{b.limit == null ? '—' : fmtW(b.limit)}</span>
            <span className="num trips">{usedBy(b.id)}</span>
          </button>
        ) })}
        {!state.bags.length && <div className="empty"><p>No bags yet. Start from a preset above and correct the numbers.</p></div>}
        {state.bags.length > 1 && (by.sorted
          ? <p className="hint" style={{ padding: '8px 8px 0' }}>Sorted by {by.sorted.toLowerCase()}. <button type="button" className="link" onClick={by.clear}>Show your order</button> to drag bags into it; the first is what a new trip starts with.</p>
          : <p className="hint" style={{ padding: '8px 8px 0' }}>Drag the grip to reorder. The first bag is what a new trip starts with.</p>)}
      </div>
    </section>
  )
}
