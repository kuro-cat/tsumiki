import { useState, type ChangeEvent, type FormEvent } from 'react'
import { fmtDim, fmtW, uid, type Bag } from '../store'
import type { ViewProps } from '../App'

const blank = (): Bag => ({ id: uid(), name: '', l: 50, w: 32, h: 20, empty: 1200, limit: null })
const PRESETS = [
  { name: 'Carry-on', l: 52, w: 36, h: 18, empty: 2500, limit: 10000 },
  { name: 'Personal item', l: 40, w: 28, h: 15, empty: 800, limit: null },
  { name: 'Checked, medium', l: 68, w: 46, h: 26, empty: 3800, limit: 23000 },
  { name: 'Daypack 20 L', l: 42, w: 26, h: 16, empty: 600, limit: null },
]
const COLS = { gridTemplateColumns: 'minmax(0, 2fr) 150px 90px 90px 60px' }

export function Bags({ state, api }: ViewProps) {
  const [form, setForm] = useState<Bag>(blank)
  const [editing, setEditing] = useState(false)
  const set = <K extends keyof Bag>(k: K, v: Bag[K]) => setForm((f) => ({ ...f, [k]: v }))
  const num = (k: 'l' | 'w' | 'h' | 'empty') => (e: ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value))
  const cancel = () => { setForm(blank()); setEditing(false) }
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const { sample: _s, ...rest } = form
    api.upsertBag({ ...rest, name: form.name.trim() })
    cancel()
  }
  const usedBy = (id: string) => state.trips.filter((t) => t.bagId === id).length

  return (
    <section className="page">
      <div className="page-head">
        <h1>Bags</h1>
        <p className="muted">Interior dimensions, empty weight, and the limit you pack against.</p>
        <span className="label">{state.bags.length} bags</span>
      </div>
      <form className="form" onSubmit={save} aria-label={editing ? 'Edit bag' : 'Add bag'}>
        <label className="field s4"><span className="label">Name</span><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Travel backpack 40 L" required /></label>
        <label className="field s1"><span className="label">Length</span><span className="unit"><input type="number" min={1} step={0.5} value={form.l} onChange={num('l')} required /><span className="dim">cm</span></span></label>
        <label className="field s1"><span className="label">Width</span><span className="unit"><input type="number" min={1} step={0.5} value={form.w} onChange={num('w')} required /><span className="dim">cm</span></span></label>
        <label className="field s1"><span className="label">Depth</span><span className="unit"><input type="number" min={1} step={0.5} value={form.h} onChange={num('h')} required /><span className="dim">cm</span></span></label>
        <label className="field s2"><span className="label">Empty weight</span><span className="unit"><input type="number" min={0} step={10} value={form.empty} onChange={num('empty')} required /><span className="dim">g</span></span></label>
        <label className="field s3"><span className="label">Weight limit</span><span className="unit"><input type="number" min={0} step={100} value={form.limit ?? ''} onChange={(e) => set('limit', e.target.value === '' ? null : Number(e.target.value))} placeholder="none" /><span className="dim">g</span></span></label>
        <div className="presets">
          <span className="label">Start from</span>
          {PRESETS.map((p) => (
            <button key={p.name} type="button" className="btn quiet" onClick={() => setForm((f) => ({ ...f, ...p, name: f.name || p.name }))}>{p.name} · {fmtDim(p)}</button>
          ))}
          <span className="hint">Approximate interior sizes. Check your airline's numbers and edit.</span>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">{editing ? 'Save changes' : 'Add bag'}</button>
          {editing && <button className="btn quiet" type="button" onClick={cancel}>Cancel</button>}
          <span className="hint">Measure the inside of the main compartment.</span>
          {editing && (
            <div className="right">
              <button className="btn danger" type="button" onClick={() => { api.removeBag(form.id); cancel() }} title={usedBy(form.id) ? 'Trips using this bag will lose their placements' : undefined}>Delete bag</button>
            </div>
          )}
        </div>
      </form>
      <div className="table">
        <div className="trow head" style={COLS}><span className="label">Name</span><span className="label num">L × W × D cm</span><span className="label num">Empty</span><span className="label num">Limit</span><span className="label num">Trips</span></div>
        {state.bags.map((b) => (
          <button key={b.id} type="button" className="trow" style={COLS} aria-current={editing && form.id === b.id ? 'true' : undefined} onClick={() => { setForm(b); setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
            <span className="name"><span>{b.name}</span>{b.sample && <span className="tag">sample</span>}</span>
            <span className="num">{fmtDim(b)}</span>
            <span className="num">{fmtW(b.empty)}</span>
            <span className="num">{b.limit == null ? '—' : fmtW(b.limit)}</span>
            <span className="num">{usedBy(b.id)}</span>
          </button>
        ))}
        {!state.bags.length && <div className="empty"><p>No bags yet. Start from a preset above and correct the numbers.</p></div>}
      </div>
    </section>
  )
}
