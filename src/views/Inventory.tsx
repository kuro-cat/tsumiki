import { useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react'
import { CATEGORIES, SWATCHES, defaultCapacity, defaultKind, defaultUp, fmtSize, fmtW, uid, titleCase, type Category, type Item, type Kind } from '../store'
import type { ViewProps } from '../App'
import { CatIcon, Icon } from '../Icon'
import { Blank } from './Blank'
import { useSort, type Col } from './Sort'

/** Form state carries both shapes so switching kind keeps whatever was typed. */
type Form = { id: string; name: string; category: Category; kind: Kind; l: number; w: number; h: number; volume: number; packsTo: number; weight: number; qty: number; color: string; up: boolean; capacity: number; autoCap: boolean }
const COLS = { '--cols': 'minmax(0, 2fr) minmax(0, 1fr) 150px 190px 80px 44px' } as CSSProperties
const SORT: Col<Item>[] = [
  { label: 'Name', key: (i) => i.name },
  { label: 'Category', key: (i) => i.category },
  { label: 'Kind', key: (i) => i.kind },
  { label: 'Size', num: true, key: (i) => (i.kind === 'soft' ? i.volume * 1000 : i.l * i.w * i.h) },
  { label: 'Weight', num: true, key: (i) => i.weight },
  { label: 'Qty', num: true, key: (i) => i.qty },
]

export function Inventory({ state, api }: ViewProps) {
  const blank = (): Form => ({ id: uid(), name: '', category: 'clothing', kind: 'soft', l: 20, w: 15, h: 5, volume: 2, packsTo: state.packsTo.clothing, weight: 200, qty: 1, color: '', up: false, capacity: defaultCapacity({ l: 20, w: 15, h: 5 }), autoCap: true })
  const toForm = (it: Item): Form => ({ ...blank(), id: it.id, name: it.name, category: it.category, kind: it.kind, weight: it.weight, qty: it.qty, color: it.color ?? '', ...(it.kind === 'soft' ? { volume: it.volume, packsTo: it.packsTo } : { l: it.l, w: it.w, h: it.h, up: it.up, ...(it.kind === 'container' ? { capacity: it.capacity, autoCap: false } : {}) }) })
  const [form, setForm] = useState<Form>(blank)
  const [editing, setEditing] = useState(false)
  // The form waits until it's asked for: Add item, or a click on a row.
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const by = useSort(SORT)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const num = (k: 'l' | 'w' | 'h' | 'volume' | 'packsTo' | 'weight' | 'qty') => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => {
    const n = { ...f, [k]: Number(e.target.value) }
    return n.autoCap && (k === 'l' || k === 'w' || k === 'h') ? { ...n, capacity: defaultCapacity(n) } : n
  })
  const setCategory = (c: Category) => setForm((f) => ({ ...f, category: c, kind: defaultKind(c), packsTo: state.packsTo[c], up: defaultUp(c) }))
  const cancel = () => { setForm(blank()); setEditing(false); setOpen(false) }
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const base = { id: form.id, name: form.name.trim(), category: form.category, weight: form.weight, qty: form.qty, ...(form.color ? { color: form.color } : {}) }
    const box = { l: form.l, w: form.w, h: form.h, up: form.up }
    api.upsertItem(form.kind === 'soft' ? { ...base, kind: 'soft', volume: form.volume, packsTo: form.packsTo } : form.kind === 'container' ? { ...base, kind: 'container', ...box, capacity: form.capacity } : { ...base, kind: 'rigid', ...box })
    cancel()
  }
  // Unsorted, the schedule reads by category then name; a sorted column keeps that as its tie-break.
  const list = by.sort(state.items
    .filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)))
  const totalW = state.items.reduce((a, i) => a + i.weight * i.qty, 0)

  return (
    <section className="page">
      <div className="page-head">
        <h1>Inventory</h1>
        <span className="label">{state.items.length} items · {fmtW(totalW)}</span>
        <div className="right">
          <input type="search" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter items" />
          {!open && <button className="btn primary" onClick={() => { setForm(blank()); setEditing(false); setOpen(true) }}><Icon name="plus" />Add item</button>}
        </div>
      </div>
      {state.items.some((i) => i.sample) && <p className="hint">Includes sample items. Remove them under Data once you've added your own.</p>}
      {open && <form className="form" onSubmit={save} aria-label={editing ? 'Edit item' : 'Add item'}>
        <div className="form-title"><h2>{editing ? form.name || 'Edit item' : 'New item'}</h2><button type="button" className="btn quiet" onClick={cancel} aria-label="Close"><Icon name="x" /></button></div>
        <label className="field s4"><span className="label">Name</span><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Rain jacket" required /></label>
        <label className="field s2"><span className="label">Category</span><select value={form.category} onChange={(e) => setCategory(e.target.value as Category)}>{CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select></label>
        <div className="field s3"><span className="label">Kind</span>
          <div className="seg" role="group" aria-label="Kind">
            <button type="button" aria-pressed={form.kind === 'rigid'} onClick={() => set('kind', 'rigid')}>Rigid</button>
            <button type="button" aria-pressed={form.kind === 'soft'} onClick={() => set('kind', 'soft')}>Soft</button>
            <button type="button" aria-pressed={form.kind === 'container'} onClick={() => set('kind', 'container')}>Container</button>
          </div>
        </div>
        <label className="field s2"><span className="label">Weight</span><span className="unit"><input type="number" min={1} step={1} value={form.weight} onChange={num('weight')} required /><span className="dim">g</span></span></label>
        <label className="field s1"><span className="label">Qty</span><input type="number" min={1} step={1} value={form.qty} onChange={num('qty')} required /></label>
        {form.kind !== 'soft' ? (
          <>
            <label className="field s2"><span className="label">Length</span><span className="unit"><input type="number" min={0.5} step={0.5} value={form.l} onChange={num('l')} required /><span className="dim">cm</span></span></label>
            <label className="field s2"><span className="label">Width</span><span className="unit"><input type="number" min={0.5} step={0.5} value={form.w} onChange={num('w')} required /><span className="dim">cm</span></span></label>
            <label className="field s2"><span className="label">Height</span><span className="unit"><input type="number" min={0.5} step={0.5} value={form.h} onChange={num('h')} required /><span className="dim">cm</span></span></label>
            <div className="field s2"><span className="label">Orientation</span><label className="chip"><input type="checkbox" checked={form.up} onChange={(e) => set('up', e.target.checked)} />This side up</label></div>
            {form.kind === 'container' && <label className="field s2"><span className="label">Holds</span><span className="unit"><input type="number" min={0.1} step={0.1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value), autoCap: false }))} required /><span className="dim">L</span></span></label>}
          </>
        ) : (
          <>
            <label className="field s3"><span className="label">Volume</span><span className="unit"><input type="number" min={0.1} step={0.1} value={form.volume} onChange={num('volume')} required /><span className="dim">L</span></span></label>
            <label className="field s3"><span className="label">Packed size</span><span className="unit"><input type="number" min={5} max={100} step={5} value={form.packsTo} onChange={num('packsTo')} required /><span className="dim">%</span></span></label>
          </>
        )}
        <div className="field s12"><span className="label">Colour</span>
          <div className="radios" role="radiogroup" aria-label="Item colour">
            <label className="chip"><input type="radio" name="color" checked={!form.color} onChange={() => set('color', '')} />None</label>
            {SWATCHES.map((c) => (
              <label key={c} className="chip sw-chip" title={c}><input type="radio" name="color" checked={form.color === c} onChange={() => set('color', c)} aria-label={`Colour ${c}`} /><i className="sw" style={{ '--sw': c } as CSSProperties} /></label>
            ))}
            <label className={'chip' + (form.color && !SWATCHES.includes(form.color) ? ' on' : '')}><input type="color" value={form.color || '#888888'} onChange={(e) => set('color', e.target.value)} aria-label="Custom colour" />Custom</label>
          </div>
        </div>
        <div className="form-actions">
          <button className="btn primary" type="submit">{editing ? 'Save changes' : 'Add item'}</button>
          <button className="btn text" type="button" onClick={cancel}>Cancel</button>
          <span className="hint">{form.kind === 'rigid' ? 'Measure it as it goes in the bag.' : form.kind === 'container' ? 'Outer size. Holds is what fits inside.' : 'Packed size: how much of its volume it takes once squashed into a bag.'}</span>
          {editing && <div className="right"><button className="btn danger" type="button" onClick={() => { api.removeItem(form.id); cancel() }}>Delete item</button></div>}
        </div>
      </form>}
      <div>
        <div className="table">
          <div className="trow head sortable" style={COLS}>{by.head}</div>
          {list.map((it) => (
            <button key={it.id} type="button" className="trow" style={COLS} aria-current={editing && form.id === it.id ? 'true' : undefined} onClick={() => { setForm(toForm(it)); setEditing(true); setOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
              <span className="name"><CatIcon it={it} /><span className="truncate">{it.name}</span></span>
              <span className="dim">{titleCase(it.category)}</span>
              <span className="dim">{titleCase(it.kind)}{it.kind !== 'soft' && it.up ? ', upright' : ''}</span>
              <span className="num">{fmtSize(it)}</span>
              <span className="num">{fmtW(it.weight)}</span>
              <span className="num qty">{it.qty}</span>
            </button>
          ))}
          {!list.length && (q ? <div className="empty"><p className="muted">Nothing matches “{q}”.</p></div> : <Blank art="list" title="Nothing here yet">Add what you own with its size and weight, and it can be packed on any trip.</Blank>)}
        </div>
      </div>
    </section>
  )
}
