import { useState, type ChangeEvent, type FormEvent } from 'react'
import { CATEGORIES, fmtDim, fmtW, uid, type Item } from '../store'
import type { ViewProps } from '../App'

const blank = (): Item => ({ id: uid(), name: '', category: 'clothing', l: 20, w: 15, h: 5, weight: 200, qty: 1 })
const COLS = { gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) 130px 80px 44px' }

export function Inventory({ state, api }: ViewProps) {
  const [form, setForm] = useState<Item>(blank)
  const [editing, setEditing] = useState(false)
  const [q, setQ] = useState('')
  const set = <K extends keyof Item>(k: K, v: Item[K]) => setForm((f) => ({ ...f, [k]: v }))
  const num = (k: 'l' | 'w' | 'h' | 'weight' | 'qty') => (e: ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value))
  const cancel = () => { setForm(blank()); setEditing(false) }
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const { sample: _s, ...rest } = form
    api.upsertItem({ ...rest, name: form.name.trim() })
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
        <p className="muted">Everything that might travel, with the dimensions the plan needs.</p>
        <span className="label">{state.items.length} items · {fmtW(totalW)}</span>
      </div>
      <form className="form" onSubmit={save} aria-label={editing ? 'Edit item' : 'Add item'}>
        <label className="field s4"><span className="label">Name</span><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Rain jacket, packed" required /></label>
        <label className="field s2"><span className="label">Category</span><select value={form.category} onChange={(e) => set('category', e.target.value as Item['category'])}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field s1"><span className="label">Length</span><span className="unit"><input type="number" min={0.5} step={0.5} value={form.l} onChange={num('l')} required /><span className="dim">cm</span></span></label>
        <label className="field s1"><span className="label">Width</span><span className="unit"><input type="number" min={0.5} step={0.5} value={form.w} onChange={num('w')} required /><span className="dim">cm</span></span></label>
        <label className="field s1"><span className="label">Height</span><span className="unit"><input type="number" min={0.5} step={0.5} value={form.h} onChange={num('h')} required /><span className="dim">cm</span></span></label>
        <label className="field s2"><span className="label">Weight</span><span className="unit"><input type="number" min={1} step={1} value={form.weight} onChange={num('weight')} required /><span className="dim">g</span></span></label>
        <label className="field s1"><span className="label">Qty</span><input type="number" min={1} step={1} value={form.qty} onChange={num('qty')} required /></label>
        <div className="form-actions">
          <button className="btn" type="submit">{editing ? 'Save changes' : 'Add item'}</button>
          {editing && <button className="btn quiet" type="button" onClick={cancel}>Cancel</button>}
          <span className="hint">Measure it folded or packed, the way it goes in the bag.</span>
          {editing && <div className="right"><button className="btn danger" type="button" onClick={() => { api.removeItem(form.id); cancel() }}>Delete item</button></div>}
        </div>
      </form>
      <div>
        <div className="page-head">
          <h2>Item schedule</h2>
          <input type="search" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 200, marginLeft: 'auto' }} aria-label="Filter items" />
        </div>
        <div className="table" style={{ marginTop: 8 }}>
          <div className="trow head" style={COLS}><span className="label">Name</span><span className="label">Category</span><span className="label num">L × W × H cm</span><span className="label num">Weight</span><span className="label num">Qty</span></div>
          {list.map((it) => (
            <button key={it.id} type="button" className="trow" style={COLS} aria-current={editing && form.id === it.id ? 'true' : undefined} onClick={() => { setForm(it); setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
              <span className="name"><span>{it.name}</span>{it.sample && <span className="tag">sample</span>}</span>
              <span className="dim">{it.category}</span>
              <span className="num">{fmtDim(it)}</span>
              <span className="num">{fmtW(it.weight)}</span>
              <span className="num">{it.qty}</span>
            </button>
          ))}
          {!list.length && <div className="empty"><p>{q ? 'Nothing matches that filter.' : 'No items yet. Add the first one above.'}</p></div>}
        </div>
      </div>
    </section>
  )
}
