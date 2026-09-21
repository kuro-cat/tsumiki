import { useState, type ChangeEvent, type FormEvent } from 'react'
import { bagVolume, fmtDim, fmtVol, fmtW, newBag, newCompartment, type Bag, type Compartment } from '../store'
import type { ViewProps } from '../App'
import { Icon } from '../Icon'

const blank = (): Bag => ({ ...newBag('', 50, 32, 20, 1200, null) })
const PRESETS = [
  { name: 'Carry-on', l: 52, w: 36, h: 18, empty: 2500, limit: 10000 },
  { name: 'Personal item', l: 40, w: 28, h: 15, empty: 800, limit: null },
  { name: 'Checked, medium', l: 68, w: 46, h: 26, empty: 3800, limit: 23000 },
  { name: 'Daypack 20 L', l: 42, w: 26, h: 16, empty: 600, limit: null },
]
const COLS = { gridTemplateColumns: 'minmax(0, 2fr) 150px 90px 90px 90px 60px' }
const CCOLS = { gridTemplateColumns: 'minmax(0, 2fr) repeat(6, 72px) 36px' }
type Num = 'l' | 'w' | 'h' | 'x' | 'y' | 'z'

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
  const usedBy = (id: string) => state.trips.filter((t) => t.bagId === id).length
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
        <label className="field s6"><span className="label">Name</span><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Travel backpack 40 L" required /></label>
        <label className="field s3"><span className="label">Empty weight</span><span className="unit"><input type="number" min={0} step={10} value={form.empty} onChange={(e) => set('empty', Number(e.target.value))} required /><span className="dim">g</span></span></label>
        <label className="field s3"><span className="label">Weight limit</span><span className="unit"><input type="number" min={0} step={100} value={form.limit ?? ''} onChange={(e) => set('limit', e.target.value === '' ? null : Number(e.target.value))} placeholder="none" /><span className="dim">g</span></span></label>
        <div className="field s12">
          <span className="label">Compartments</span>
          <div className="table comps">
            <div className="trow head" style={CCOLS}>
              <span className="label">Name</span><span className="label num">L cm</span><span className="label num">W cm</span><span className="label num">D cm</span><span className="label num">X</span><span className="label num">Y</span><span className="label num">Z</span><span />
            </div>
            {form.compartments.map((c, i) => (
              <div key={c.id} className="trow" style={CCOLS}>
                <input type="text" value={c.name} onChange={(e) => setComp(c.id, { name: e.target.value })} aria-label="Compartment name" placeholder={i === 0 ? 'Main' : 'Pocket'} />
                {(['l', 'w', 'h', 'x', 'y', 'z'] as Num[]).map((k) => (
                  <input key={k} type="number" min={k === 'x' || k === 'y' || k === 'z' ? 0 : 1} step={0.5} value={c[k]} onChange={numC(c.id, k)} aria-label={k.toUpperCase()} required />
                ))}
                <button type="button" className="btn quiet" onClick={() => set('compartments', form.compartments.filter((x) => x.id !== c.id))} disabled={i === 0} aria-label={`Remove ${c.name}`} title={i === 0 ? 'Every bag has a Main compartment' : 'Remove'}><Icon name="x" /></button>
              </div>
            ))}
          </div>
          <div className="tools" style={{ marginTop: 8 }}>
            <button type="button" className="btn quiet" onClick={addComp}><Icon name="plus" />Add compartment</button>
            <span className="hint">Measure each inside. X, Y, Z is where it sits in the assembled bag; drag them into place under Assemble on the plan.</span>
          </div>
        </div>
        <div className="presets">
          <span className="label">Start from</span>
          {PRESETS.map((p) => (
            <button key={p.name} type="button" className="btn quiet" onClick={() => applyPreset(p)}>{p.name} · {fmtDim(p)}</button>
          ))}
          <span className="hint">Approximate interior sizes for the Main compartment. Check your airline's numbers and edit.</span>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">{editing ? 'Save changes' : 'Add bag'}</button>
          {editing && <button className="btn quiet" type="button" onClick={cancel}>Cancel</button>}
          {editing && (
            <div className="right">
              <button className="btn danger" type="button" onClick={() => { api.removeBag(form.id); cancel() }} title={usedBy(form.id) ? 'Trips using this bag will lose their placements' : undefined}>Delete bag</button>
            </div>
          )}
        </div>
      </form>
      <div className="table">
        <div className="trow head" style={COLS}><span className="label">Name</span><span className="label num">Main L × W × D cm</span><span className="label num">Volume</span><span className="label num">Empty</span><span className="label num">Limit</span><span className="label num">Trips</span></div>
        {state.bags.map((b) => (
          <button key={b.id} type="button" className="trow" style={COLS} aria-current={editing && form.id === b.id ? 'true' : undefined} onClick={() => { setForm(b); setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
            <span className="name"><span>{b.name}</span>{b.compartments.length > 1 && <span className="tag">{b.compartments.length} compartments</span>}{b.sample && <span className="tag">sample</span>}</span>
            <span className="num">{fmtDim(b.compartments[0])}</span>
            <span className="num">{fmtVol(bagVolume(b))}</span>
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
