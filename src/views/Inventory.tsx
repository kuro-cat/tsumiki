import { useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react'
import { CATEGORIES, SWATCHES, defaultCapacity, defaultKind, defaultUp, fmtSize, fmtW, uid, titleCase, type Category, type Item, type Kind } from '../store'
import type { ViewProps } from '../App'
import { CatIcon, Icon } from '../Icon'
import { Blank } from './Blank'
import { useSort, type Col } from './Sort'
import { Field, FormCard, PageHead, Seg, SizeInput, Slider, Stepper, UnitInput, useEditor } from '../ui'
import { ColourPick, type Swatch } from '../pickers'

const SWATCH_NAMES = ['Clay', 'Ochre', 'Olive', 'Teal', 'Blue', 'Slate', 'Bark', 'Sand']
const ITEM_SWATCHES: Swatch[] = [{ value: '', name: 'No colour', paint: 'transparent' }, ...SWATCHES.map((c, i) => ({ value: c, name: SWATCH_NAMES[i] ?? c, paint: c }))]

/** Form state carries both shapes so switching kind keeps whatever was typed. */
type Form = { id: string; name: string; category: Category; kind: Kind; l: number; w: number; h: number; volume: number; packsTo: number; weight: number; qty: number; color: string; up: boolean; capacity: number; autoCap: boolean }
const COLS = { '--cols': 'minmax(0, 2fr) minmax(0, 1fr) 150px 190px 80px 44px' } as CSSProperties
const KIND_OPTIONS: Kind[] = ['rigid', 'soft', 'container']
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
  // The form waits until it's asked for: Add item, or a click on a row.
  const ed = useEditor(blank)
  const { form, setForm, editing } = ed
  const [q, setQ] = useState('')
  const by = useSort(SORT)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const num = (k: 'l' | 'w' | 'h' | 'volume' | 'packsTo' | 'weight' | 'qty') => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => {
    const n = { ...f, [k]: Number(e.target.value) }
    return n.autoCap && (k === 'l' || k === 'w' || k === 'h') ? { ...n, capacity: defaultCapacity(n) } : n
  })
  const setCategory = (c: Category) => setForm((f) => ({ ...f, category: c, kind: defaultKind(c), packsTo: state.packsTo[c], up: defaultUp(c) }))
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const base = { id: form.id, name: form.name.trim(), category: form.category, weight: form.weight, qty: form.qty, ...(form.color ? { color: form.color } : {}) }
    const box = { l: form.l, w: form.w, h: form.h, up: form.up }
    api.upsertItem(form.kind === 'soft' ? { ...base, kind: 'soft', volume: form.volume, packsTo: form.packsTo } : form.kind === 'container' ? { ...base, kind: 'container', ...box, capacity: form.capacity } : { ...base, kind: 'rigid', ...box })
    ed.close()
  }
  // Unsorted, the schedule reads by category then name; a sorted column keeps that as its tie-break.
  const list = by.sort(state.items
    .filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)))
  const totalW = state.items.reduce((a, i) => a + i.weight * i.qty, 0)

  return (
    <section className="page">
      <PageHead title="Inventory" meta={<>{state.items.length} items · {fmtW(totalW)}</>} actions={<>
        <input type="search" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter items" />
        {!ed.open && <button className="btn primary" onClick={ed.add}><Icon name="plus" />Add item</button>}
      </>} />
      {state.items.some((i) => i.sample) && <p className="hint">Includes sample items. Remove them under Data once you've added your own.</p>}
      {ed.open && (
        <FormCard label={editing ? 'Edit item' : 'Add item'} title={editing ? form.name || 'Edit item' : 'New item'} onSubmit={save} onClose={ed.close} actions={<>
          <button className="btn primary" type="submit">{editing ? 'Save changes' : 'Add item'}</button>
          <button className="btn text" type="button" onClick={ed.close}>Cancel</button>
          <span className="hint">{form.kind === 'rigid' ? 'Measure it as it goes in the bag.' : form.kind === 'container' ? 'Outer size. Holds is what fits inside.' : 'Packed size: how much of its volume it takes once squashed into a bag.'}</span>
          {editing && <div className="right"><button className="btn danger" type="button" onClick={() => { api.removeItem(form.id); ed.close() }}>Delete item</button></div>}
        </>}>
          <Field label="Name" span={4}><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Rain jacket" required /></Field>
          <Field label="Kind" span={3} group><Seg label="Kind" options={KIND_OPTIONS} value={form.kind} onChange={(k) => set('kind', k)} /></Field>
          <Field label="Category" span={3}><select value={form.category} onChange={(e) => setCategory(e.target.value as Category)}>{CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select></Field>
          <Field label="Colour" span={2} group><ColourPick label="Item colour" value={form.color} swatches={ITEM_SWATCHES} custom onChange={(c) => set('color', c)} /></Field>
          <Field label="Weight" span={2}><UnitInput unit="g" min={1} step={1} value={form.weight} onChange={num('weight')} required /></Field>
          <Field label="Qty" span={2} group><Stepper label="Quantity" value={form.qty} onChange={(n) => set('qty', n)} /></Field>
          {form.kind !== 'soft' ? (
            <>
              <Field label="Size" span={4} group><SizeInput label="Size" value={form} onChange={num} /></Field>
              <Field label="Orientation" span={2} group><label className="chip"><input type="checkbox" checked={form.up} onChange={(e) => set('up', e.target.checked)} />This side up</label></Field>
              {form.kind === 'container' && <Field label="Holds" span={2}><UnitInput unit="L" min={0.1} step={0.1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value), autoCap: false }))} required /></Field>}
            </>
          ) : (
            <>
              <Field label="Volume" span={2}><UnitInput unit="L" min={0.1} step={0.1} value={form.volume} onChange={num('volume')} required /></Field>
              <Field label="Packed size" span={6} group><PackedSize value={form.packsTo} onChange={(n) => set('packsTo', n)} /></Field>
            </>
          )}
        </FormCard>
      )}
      <div>
        <div className="table">
          <div className="trow head sortable" style={COLS}>{by.head}</div>
          {list.map((it) => (
            <button key={it.id} type="button" className="trow" style={COLS} aria-current={editing && form.id === it.id ? 'true' : undefined} onClick={() => ed.edit(toForm(it))}>
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

/** Packed size as a slider, with the stuffed volume drawn as a square inside the loose one. */
function PackedSize({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const side = 28 * Math.sqrt(value / 100)
  return (
    <span className="packed">
      <svg width={32} height={32} viewBox="0 0 32 32" aria-hidden="true">
        <rect x={2} y={2} width={28} height={28} className="loose" />
        <rect x={2} y={30 - side} width={side} height={side} className="stuffed" />
      </svg>
      <Slider label="Packed size" value={value} min={5} max={100} step={5} unit="%" onChange={onChange} />
    </span>
  )
}
