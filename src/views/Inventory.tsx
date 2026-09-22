import { useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react'
import { CATEGORIES, SWATCHES, defaultCapacity, defaultKind, defaultUp, fmtSize, fmtW, uid, type Category, type Item, type Kind } from '../store'
import type { ViewProps } from '../App'

/** Form state carries both shapes so switching kind keeps whatever was typed. */
type Form = { id: string; name: string; category: Category; kind: Kind; l: number; w: number; h: number; volume: number; packsTo: number; weight: number; qty: number; color: string; up: boolean; capacity: number; autoCap: boolean }
const COLS = { '--cols': 'minmax(0, 2fr) minmax(0, 1fr) 70px 170px 80px 44px' } as CSSProperties

export function Inventory({ state, api }: ViewProps) {
  const blank = (): Form => ({ id: uid(), name: '', category: 'clothing', kind: 'soft', l: 20, w: 15, h: 5, volume: 2, packsTo: state.packsTo.clothing, weight: 200, qty: 1, color: '', up: false, capacity: defaultCapacity({ l: 20, w: 15, h: 5 }), autoCap: true })
  const toForm = (it: Item): Form => ({ ...blank(), id: it.id, name: it.name, category: it.category, kind: it.kind, weight: it.weight, qty: it.qty, color: it.color ?? '', ...(it.kind === 'soft' ? { volume: it.volume, packsTo: it.packsTo } : { l: it.l, w: it.w, h: it.h, up: it.up, ...(it.kind === 'container' ? { capacity: it.capacity, autoCap: false } : {}) }) })
  const [form, setForm] = useState<Form>(blank)
  const [editing, setEditing] = useState(false)
  const [q, setQ] = useState('')
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const num = (k: 'l' | 'w' | 'h' | 'volume' | 'packsTo' | 'weight' | 'qty') => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => {
    const n = { ...f, [k]: Number(e.target.value) }
    return n.autoCap && (k === 'l' || k === 'w' || k === 'h') ? { ...n, capacity: defaultCapacity(n) } : n
  })
  const setCategory = (c: Category) => setForm((f) => ({ ...f, category: c, kind: defaultKind(c), packsTo: state.packsTo[c], up: defaultUp(c) }))
  const cancel = () => { setForm(blank()); setEditing(false) }
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const base = { id: form.id, name: form.name.trim(), category: form.category, weight: form.weight, qty: form.qty, ...(form.color ? { color: form.color } : {}) }
    const box = { l: form.l, w: form.w, h: form.h, up: form.up }
    api.upsertItem(form.kind === 'soft' ? { ...base, kind: 'soft', volume: form.volume, packsTo: form.packsTo } : form.kind === 'container' ? { ...base, kind: 'container', ...box, capacity: form.capacity } : { ...base, kind: 'rigid', ...box })
    cancel()
  }
  const list = state.items
    .filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  const totalW = state.items.reduce((a, i) => a + i.weight * i.qty, 0)

  return (
    <section className="page">
      <div className="page-head">
        <h1>Inventory</h1>
        <p className="muted">Everything that might travel. Rigid items and containers are drawn as boxes; soft items fill the room around them, or go inside a container.</p>
        <span className="label">{state.items.length} items · {fmtW(totalW)}</span>
      </div>
      <form className="form" onSubmit={save} aria-label={editing ? 'Edit item' : 'Add item'}>
        <label className="field s4"><span className="label">Name</span><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Rain jacket" required /></label>
        <label className="field s2"><span className="label">Category</span><select value={form.category} onChange={(e) => setCategory(e.target.value as Category)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <div className="field s2"><span className="label">Kind</span>
          <div className="seg" role="group" aria-label="Kind">
            <button type="button" aria-pressed={form.kind === 'rigid'} onClick={() => set('kind', 'rigid')}>rigid</button>
            <button type="button" aria-pressed={form.kind === 'soft'} onClick={() => set('kind', 'soft')}>soft</button>
            <button type="button" aria-pressed={form.kind === 'container'} onClick={() => set('kind', 'container')}>container</button>
          </div>
        </div>
        <label className="field s2"><span className="label">Weight</span><span className="unit"><input type="number" min={1} step={1} value={form.weight} onChange={num('weight')} required /><span className="dim">g</span></span></label>
        <label className="field s1"><span className="label">Qty</span><input type="number" min={1} step={1} value={form.qty} onChange={num('qty')} required /></label>
        {form.kind !== 'soft' ? (
          <>
            <label className="field s2"><span className="label">Length</span><span className="unit"><input type="number" min={0.5} step={0.5} value={form.l} onChange={num('l')} required /><span className="dim">cm</span></span></label>
            <label className="field s2"><span className="label">Width</span><span className="unit"><input type="number" min={0.5} step={0.5} value={form.w} onChange={num('w')} required /><span className="dim">cm</span></span></label>
            <label className="field s2"><span className="label">Height</span><span className="unit"><input type="number" min={0.5} step={0.5} value={form.h} onChange={num('h')} required /><span className="dim">cm</span></span></label>
            <div className="field s2"><span className="label">Orientation</span><label className="chip"><input type="checkbox" checked={form.up} onChange={(e) => set('up', e.target.checked)} />this side up</label></div>
            {form.kind === 'container' && <label className="field s2"><span className="label">Holds</span><span className="unit"><input type="number" min={0.1} step={0.1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value), autoCap: false }))} required /><span className="dim">L</span></span></label>}
          </>
        ) : (
          <>
            <label className="field s3"><span className="label">Volume</span><span className="unit"><input type="number" min={0.1} step={0.1} value={form.volume} onChange={num('volume')} required /><span className="dim">L</span></span></label>
            <label className="field s3"><span className="label">Packs to</span><span className="unit"><input type="number" min={5} max={100} step={5} value={form.packsTo} onChange={num('packsTo')} required /><span className="dim">%</span></span></label>
          </>
        )}
        <div className="field s12"><span className="label">Colour</span>
          <div className="radios" role="radiogroup" aria-label="Item colour">
            <label className="chip"><input type="radio" name="color" checked={!form.color} onChange={() => set('color', '')} />none</label>
            {SWATCHES.map((c) => (
              <label key={c} className="chip sw-chip" title={c}><input type="radio" name="color" checked={form.color === c} onChange={() => set('color', c)} aria-label={`Colour ${c}`} /><i className="sw" style={{ '--sw': c } as CSSProperties} /></label>
            ))}
            <label className={'chip' + (form.color && !SWATCHES.includes(form.color) ? ' on' : '')}><input type="color" value={form.color || '#888888'} onChange={(e) => set('color', e.target.value)} aria-label="Custom colour" />custom</label>
          </div>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">{editing ? 'Save changes' : 'Add item'}</button>
          {editing && <button className="btn quiet" type="button" onClick={cancel}>Cancel</button>}
          <span className="hint">{form.kind === 'rigid' ? 'Measure it the way it goes in the bag; it keeps this shape.' : form.kind === 'container' ? 'Outer size as packed; Holds is what fits inside, prefilled at 90 % of the box.' : 'Volume as measured loose; packs-to is how much of that it takes once stuffed in.'}</span>
          {editing && <div className="right"><button className="btn danger" type="button" onClick={() => { api.removeItem(form.id); cancel() }}>Delete item</button></div>}
        </div>
      </form>
      <div>
        <div className="page-head">
          <h2>Item schedule</h2>
          <input type="search" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 200, marginLeft: 'auto' }} aria-label="Filter items" />
        </div>
        <div className="table" style={{ marginTop: 8 }}>
          <div className="trow head" style={COLS}><span className="label">Name</span><span className="label">Category</span><span className="label">Kind</span><span className="label num">Size</span><span className="label num">Weight</span><span className="label num">Qty</span></div>
          {list.map((it) => (
            <button key={it.id} type="button" className="trow" style={COLS} aria-current={editing && form.id === it.id ? 'true' : undefined} onClick={() => { setForm(toForm(it)); setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
              <span className="name"><span>{it.color && <i className="sw" style={{ '--sw': it.color } as CSSProperties} />}<span>{it.name}</span></span>{it.sample && <span className="tag">sample</span>}</span>
              <span className="dim">{it.category}</span>
              <span className="dim">{it.kind}{it.kind !== 'soft' && it.up ? ' ↑' : ''}</span>
              <span className="num">{fmtSize(it)}</span>
              <span className="num">{fmtW(it.weight)}</span>
              <span className="num qty">{it.qty}</span>
            </button>
          ))}
          {!list.length && <div className="empty"><p>{q ? 'Nothing matches that filter.' : 'No items yet. Add the first one above.'}</p></div>}
        </div>
      </div>
    </section>
  )
}
