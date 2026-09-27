import { useState, type FormEvent } from 'react'
import { CATEGORIES, titleCase, withLink, type Category, type CheckItem, type Item } from '../store'
import { Field, FormCard, Stepper } from '../ui'

export type NewEntry = Omit<CheckItem, 'id' | 'packed' | 'source'>

/** Adds one entry to a list: a name, category and quantity, linked by name, to one item, or to nothing owned. */
export function EntryForm({ items, onAdd, onClose }: { items: Item[]; onAdd: (e: NewEntry) => void; onClose: () => void }) {
  const [d, setD] = useState({ label: '', category: 'misc' as Category, qty: 1, link: '', note: '' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const label = d.label.trim()
    if (!label) return
    const base: NewEntry = { label, category: d.category, qty: Math.max(1, d.qty), match: [label.toLowerCase()], ...(d.note.trim() ? { note: d.note.trim() } : {}) }
    onAdd(d.link === '' ? withLink(base as Omit<CheckItem, 'id' | 'packed'>, items) : { ...base, itemIds: d.link === '*none' ? [] : [d.link] })
  }
  return (
    <FormCard label="Add to the list" title="Add to the list" onSubmit={submit} onClose={onClose} actions={<>
      <button className="btn primary" type="submit" disabled={!d.label.trim()}>Add to the list</button>
      <button className="btn text" type="button" onClick={onClose}>Cancel</button>
    </>}>
      <Field label="Name" span={6}><input type="text" autoFocus value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder="Gift for the hosts" required /></Field>
      <Field label="Category" span={4}><select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as Category })}>{CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select></Field>
      <Field label="Quantity" span={2} group><Stepper label="Quantity" value={d.qty} onChange={(qty) => setD({ ...d, qty })} /></Field>
      <Field label="Linked item" span={6}>
        <select value={d.link} onChange={(e) => { const it = items.find((i) => i.id === e.target.value); setD({ ...d, link: e.target.value, ...(it ? { category: it.category } : {}) }) }}>
          <option value="">Match by name</option>
          {[...items].sort((a, b) => a.name.localeCompare(b.name)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          <option value="*none">Nothing I own (tick it by hand)</option>
        </select>
      </Field>
      <Field label={<>Note <span className="dim">optional</span></>} span={6}><input type="text" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="Buy at the airport" /></Field>
    </FormCard>
  )
}
