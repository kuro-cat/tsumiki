import { useState } from 'react'
import { CATEGORIES, CLIMATES, KINDS, linkedItems, titleCase, uid, type Category, type Climate, type Template, type TemplateEntry, type TripKind } from '../store'
import { ACTIVITIES } from '../lib/suggest'
import type { ViewProps } from '../App'
import { CatIcon, Icon } from '../Icon'
import { Blank } from './Blank'
import { EntryForm } from './EntryForm'
import { LinkPicker } from './LinkPicker'
import { FormCard, Field, Seg, Stepper, Tab, TabList } from '../ui'
import { Bike, Briefcase, Camera, MountainSnow, Signpost, Tent, Timer, WavesLadder, Wine, type LucideIcon } from 'lucide-react'

const ACT_ICON: Record<(typeof ACTIVITIES)[number], LucideIcon> = { hiking: Signpost, swimming: WavesLadder, running: Timer, photography: Camera, camping: Tent, 'formal event': Wine, work: Briefcase, cycling: Bike, skiing: MountainSnow }

/** The activities as toggle chips, each with its pictogram. */
export function ActivityChips({ value, onToggle }: { value: string[]; onToggle: (a: string) => void }) {
  return (
    <div className="radios">
      {ACTIVITIES.map((a) => { const I = ACT_ICON[a]; return <button key={a} type="button" className="chip ichip" aria-pressed={value.includes(a)} onClick={() => onToggle(a)}><I size={18} strokeWidth={1.75} aria-hidden="true" />{titleCase(a)}</button> })}
    </div>
  )
}

const ANY = 'any' as const
/** Reusable checklists: pick one, edit its name, defaults and entries, or start a trip from it. */
export function Templates({ state, api, startTrip, openId, setOpenId }: Pick<ViewProps, 'state' | 'api'> & { startTrip: (templateId: string) => void; openId: string | null; setOpenId: (id: string | null) => void }) {
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const t = state.templates.find((x) => x.id === openId) ?? state.templates[0] ?? null
  const patch = (p: Partial<Template>) => t && api.upsertTemplate({ ...t, ...p })
  const patchEntry = (id: string, p: Partial<TemplateEntry>) => t && patch({ entries: t.entries.map((e) => (e.id === id ? { ...e, ...p } : e)) })
  const pick = (id: string) => { setOpenId(id); setOpenRow(null); setAdding(false) }

  if (!t) return <Blank art="list" title="No templates yet">A template is a checklist you start trips from, like a 7-day spring list. Save a trip’s list as one, or make one here.</Blank>
  return (
    <>
      <TabList className="trip-tabs cluster tight" label="Templates">
        {state.templates.map((x) => (
          <Tab key={x.id} selected={x.id === t.id} className="bagtab" onClick={() => pick(x.id)}>
            <span className="name truncate">{x.name}</span>
            <span className="num">{x.entries.length} items</span>
          </Tab>
        ))}
      </TabList>
      <div className="trip-body">
        <FormCard label="Template" title={t.name || 'Template'} head={<button type="button" className="btn primary" onClick={() => startTrip(t.id)}>Start a trip <Icon name="arrow" /></button>} actions={<>
          <button className="btn" type="button" onClick={() => { const c = api.duplicateTemplate(t.id); if (c) pick(c.id) }}>Duplicate</button>
          <div className="right"><button className="btn danger" type="button" onClick={() => { api.removeTemplate(t.id); setOpenId(null) }}>Delete template</button></div>
        </>}>
          <Field label="Name" span={6}><input type="text" value={t.name} onChange={(e) => patch({ name: e.target.value })} placeholder="7-day spring" required /></Field>
          <h3 className="form-sec">Trips start with</h3>
          <Field label="Weather" span={6} group>
            <Seg label="Weather" options={[ANY, ...CLIMATES]} names={{ any: 'Any' }} value={t.climate ?? ANY} onChange={(v) => patch({ climate: v === ANY ? undefined : (v as Climate) })} />
          </Field>
          <Field label="Kind of trip" span={6} group>
            <Seg label="Kind of trip" options={[ANY, ...KINDS]} names={{ any: 'Any' }} value={t.kind ?? ANY} onChange={(v) => patch({ kind: v === ANY ? undefined : (v as TripKind) })} />
          </Field>
          <Field label="Activities" span={12} group>
            <ActivityChips value={t.activities ?? []} onToggle={(a) => { const cur = t.activities ?? []; patch({ activities: cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a] }) }} />
          </Field>
        </FormCard>

        <div className="checklist">
          <div className="page-head">
            <h2>Checklist</h2>
            <span className="label">{t.entries.length} items</span>
          </div>
          {!adding && <div className="cluster"><button className="btn primary" type="button" onClick={() => setAdding(true)}><Icon name="plus" />Add</button></div>}
          {adding && <EntryForm items={state.items} onClose={() => setAdding(false)} onAdd={(e) => { patch({ entries: [{ ...e, id: uid() }, ...t.entries] }); setAdding(false) }} />}
          <div className="table">
            {t.entries.map((e) => {
              const linked = linkedItems(e, state.items)
              return (
                <div key={e.id} className="check-row tpl">
                  <span className="qty">{e.qty}</span>
                  <button type="button" className="lbl" aria-expanded={openRow === e.id} onClick={() => setOpenRow(openRow === e.id ? null : e.id)}>
                    <span className="entry"><CatIcon it={{ category: e.category, color: linked[0]?.color }} /><span>{e.label}</span></span>
                    <span className="count">{linked.length ? linked.map((i) => i.name).join(', ') : 'Not in inventory'}</span>
                    <span className="chev" aria-hidden="true"><Icon name="chev" /></span>
                  </button>
                  <span />
                  {openRow === e.id && (
                    <div className="more">
                      <div className="tpl-edit">
                        <Field label="Name"><input type="text" value={e.label} onChange={(ev) => patchEntry(e.id, { label: ev.target.value })} required /></Field>
                        <Field label="Category"><select value={e.category} onChange={(ev) => patchEntry(e.id, { category: ev.target.value as Category })}>{CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select></Field>
                        <Field label="Quantity" group><Stepper label="Quantity" value={e.qty} onChange={(qty) => patchEntry(e.id, { qty })} /></Field>
                        <Field label="Note"><input type="text" value={e.note ?? ''} onChange={(ev) => patchEntry(e.id, { note: ev.target.value || undefined })} placeholder="optional" /></Field>
                      </div>
                      <LinkPicker entry={e} items={state.items} onChange={(itemIds) => patchEntry(e.id, { itemIds })} />
                      <div><button className="btn text" type="button" onClick={() => { api.snap(`Removed ${e.label}`); patch({ entries: t.entries.filter((x) => x.id !== e.id) }) }}><Icon name="x" />Remove from the template</button></div>
                    </div>
                  )}
                </div>
              )
            })}
            {!t.entries.length && <Blank art="list" title="The template is empty">Add what every trip like this needs.</Blank>}
          </div>
        </div>
      </div>
    </>
  )
}
