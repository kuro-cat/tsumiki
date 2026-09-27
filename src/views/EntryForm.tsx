import { useState, type FormEvent } from 'react'
import { withLink, type Category, type CheckItem, type Item } from '../store'
import { Choice, Field, FormCard, Stepper } from '../ui'
import { CatIcon } from '../Icon'
import { CategoryPick } from '../pickers'

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
      <Field label="Category" span={4} group><CategoryPick value={d.category} onChange={(category) => setD({ ...d, category })} /></Field>
      <Field label="Quantity" span={2} group><Stepper label="Quantity" value={d.qty} onChange={(qty) => setD({ ...d, qty })} /></Field>
      <Field label="Linked item" span={6} group>
        <Choice label="Linked item" value={d.link} onChange={(link) => { const it = items.find((i) => i.id === link); setD({ ...d, link, ...(it ? { category: it.category } : {}) }) }} options={[
          { value: '', label: 'Match by name' },
          ...[...items].sort((a, b) => a.name.localeCompare(b.name)).map((i) => ({ value: i.id, label: i.name, icon: <CatIcon it={i} /> })),
          { value: '*none', label: 'Nothing I own', hint: 'tick it by hand' },
        ]} />
      </Field>
      <Field label={<>Note <span className="dim">optional</span></>} span={6}><input type="text" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="Buy at the airport" /></Field>
    </FormCard>
  )
}
