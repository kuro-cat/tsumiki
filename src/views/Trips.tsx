import { useState } from 'react'
import { CLIMATES, KINDS, bagLeaves, dropBag, entryUnits, fmtDate, inBag, isPacked, linkedItems, newTrip, nights, addTemplate, repack, shownUnit, toggle, tripBags, tripReady, uid, withLink, titleCase, type Bag, type SharedLimit, type Trip } from '../store'
import { LinkPicker } from './LinkPicker'
import { EntryForm } from './EntryForm'
import { Templates } from './Templates'
import { ActivityChips, CheckRow } from './Checklist'
import { suggest } from '../lib/suggest'
import type { ViewProps } from '../App'
import { Icon } from '../Icon'
import { Blank } from './Blank'
import { Field, Menu, FormCard, IconButton, PageHead, Seg, Tab, TabList, UnitInput } from '../ui'
import { DateRange } from '../pickers'



export function Trips({ state, api, go }: ViewProps) {
  const [editId, setEditId] = useState<string | null>(state.activeTripId)
  const trip = state.trips.find((t) => t.id === editId) ?? state.trips[0] ?? null
  const [draft, setDraft] = useState(false)
  const [mode, setMode] = useState<'trips' | 'templates'>('trips')
  const [tplId, setTplId] = useState<string | null>(null)
  // Details show as one summary until Edit; checklist rows open for linking on click.
  // A trip nobody has named yet opens straight into its details.
  const [editing, setEditing] = useState(() => !!trip && trip.name === 'New trip' && !trip.checklist.length)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; red?: boolean } | null>(null)
  const patch = (p: Partial<Trip>) => trip && api.patchTrip(trip.id, p)
  /** Shows a trip, closing any open row and message; `edit` opens or closes its form, and leaves it as it is when absent. */
  const show = (id: string, edit?: boolean) => { setEditId(id); if (edit !== undefined) setEditing(edit); setOpenRow(null); setMsg(null) }

  const startNew = () => {
    const t = newTrip(state.bags[0]?.id ?? null)
    api.upsertTrip(t)
    show(t.id, true)
  }
  const regenerate = () => {
    if (!trip) return
    const keep = trip.checklist.filter((c) => c.source !== 'rule')
    const rules = suggest({ nights: nights(trip), climate: trip.climate, kind: trip.kind, activities: trip.activities })
      .filter((r) => !keep.some((k) => k.label.toLowerCase() === r.label.toLowerCase()))
      .map((r) => {
        const prev = trip.checklist.find((c) => c.label === r.label)
        return { ...withLink(r, state.items), ...(prev?.itemIds ? { itemIds: prev.itemIds } : {}), id: prev?.id ?? uid(), packed: prev?.packed ?? false }
      })
    patch({ checklist: [...rules, ...keep] })
    setMsg({ text: `${rules.length} items for ${nights(trip)} nights, ${trip.climate} weather, ${trip.kind}${trip.activities.length ? ', ' + trip.activities.join(', ') : ''}.` })
  }
  const askAi = async () => {
    if (!trip) return
    if (!state.apiKey) return setMsg({ text: 'Add a Claude API key under Data first.', red: true })
    setBusy(true)
    setMsg(null)
    try {
      const { name, destination, start, end, climate, kind, activities } = trip
      const { aiExtras } = await import('../lib/ai')
      const extras = await aiExtras(state.apiKey, { name, destination, start, end, climate, kind, activities }, trip.checklist.map((c) => c.label))
      const fresh = extras.filter((e) => !trip.checklist.some((c) => c.label.toLowerCase() === e.label.toLowerCase())).map((e) => ({ ...withLink(e, state.items), id: uid(), packed: false }))
      api.patchTrip(trip.id, (t) => ({ checklist: [...t.checklist, ...fresh] }))
      setMsg({ text: fresh.length ? `${fresh.length} destination extras added.` : 'Claude had nothing to add.' })
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'Request failed.', red: true })
    } finally {
      setBusy(false)
    }
  }
  const toggleAct = (a: string) => trip && patch({ activities: toggle(trip.activities, a) })
  const open = () => { if (trip) { api.set({ activeTripId: trip.id }); go('Plan') } }
  const duplicate = () => {
    const t = trip && api.duplicateTrip(trip.id)
    if (t) show(t.id)
  }
  const fromTemplate = (id: string) => {
    const t = api.tripFromTemplate(id)
    if (t) { setMode('trips'); show(t.id, true) }
  }
  const remove = () => {
    if (!trip) return
    api.removeTrip(trip.id)
    setEditId(null)
  }

  return (
    <section className="page narrow">
      <PageHead title={mode === 'trips' ? 'Trips' : 'Templates'} meta={<Seg label="Show" options={['trips', 'templates'] as const} value={mode} onChange={setMode} />} actions={mode === 'trips' ? <>
        {state.templates.length > 0 && <Menu label="New trip from a template" placeholder="From template…" onPick={fromTemplate} items={state.templates.map((t) => ({ value: t.id, label: t.name, hint: `${t.entries.length} items` }))} />}
        <button className="btn primary" onClick={startNew}><Icon name="plus" />New trip</button>
      </> : <button className="btn primary" onClick={() => { const t = { id: uid(), name: 'New template', entries: [] }; api.upsertTemplate(t); setTplId(t.id) }}><Icon name="plus" />New template</button>} />
      {mode === 'templates' ? <Templates state={state} api={api} startTrip={fromTemplate} openId={tplId} setOpenId={setTplId} /> : <>
      {/* Trips as sheet tabs across the top; the chosen trip gets the full width below. */}
      {state.trips.length > 0 ? (
        <TabList className="trip-tabs cluster tight" label="Trips">
          {state.trips.map((t) => {
            const done = t.checklist.filter((c) => isPacked(c, t, state.items)).length
            return (
              <Tab key={t.id} selected={trip?.id === t.id} className="bagtab" onClick={() => show(t.id, false)}>
                <span className="name truncate">{t.name}</span>
                <span className="num">{fmtDate(t.start)} · {done} of {t.checklist.length}</span>
              </Tab>
            )
          })}
        </TabList>
      ) : <Blank art="list" title="No trips yet">A trip turns its dates, weather and plans into a checklist.<button className="btn primary" onClick={startNew}>Start the first one</button></Blank>}
      <div className="trip-body">
        {trip && (
          <>
            {!editing ? (
              <div className="panel trip-card">
                <div>
                  <h2>{trip.name}</h2>
                  <p className="when">{fmtDate(trip.start)} – {fmtDate(trip.end)} · {nights(trip)} nights{trip.destination ? ` · ${trip.destination}` : ''}</p>
                </div>
                <div className="cluster tight">{[trip.climate, trip.kind, ...trip.activities].map((f) => <span key={f} className="tag">{titleCase(f)}</span>)}</div>
                <p className="muted">{tripBags(trip, state.bags).map((b) => b.name).join(' and ') || 'No bags yet'}{trip.shared?.length ? ', sharing a limit' : ''}</p>
                <div className="cluster">
                  <button className="btn primary" type="button" onClick={open}>Open the plan <Icon name="arrow" /></button>
                  <button className="btn" type="button" onClick={() => setEditing(true)}>Edit trip</button>
                  <button className="btn" type="button" onClick={duplicate}>Duplicate</button>
                  <button className="btn" type="button" onClick={() => { const t = api.saveAsTemplate(trip.id); if (t) setTplId(t.id) }} disabled={!trip.checklist.length}>Save as template</button>
                </div>
              </div>
            ) : (
            <FormCard label="Trip details" title="Edit trip" head={<button type="button" className="btn primary" onClick={() => setEditing(false)}>Done</button>} actions={<>
              <div className="right"><button className="btn danger" type="button" onClick={remove}>Delete trip</button></div>
            </>}>
              <h3 className="form-sec">When &amp; where</h3>
              <Field label="Name" span={4}><input type="text" value={trip.name} onChange={(e) => patch({ name: e.target.value })} required /></Field>
              <Field label="Destination" span={4}><input type="text" value={trip.destination} onChange={(e) => patch({ destination: e.target.value })} placeholder="City, country" /></Field>
              <Field label="Dates" span={4} group><DateRange start={trip.start} end={trip.end} onChange={(start, end) => patch({ start, end })} /></Field>
              <h3 className="form-sec">Bags</h3>
              <div className="field s12">
                <div className="tripbags">
                  {tripBags(trip, state.bags).map((b) => {
                    const others = state.bags.filter((x) => x.id !== b.id && !trip.bagIds.includes(x.id))
                    const swap = (id: string) => {
                      const to = state.bags.find((x) => x.id === id)
                      if (!to) return
                      api.snap(`Swapped ${b.name} for ${to.name}`)
                      api.patchTrip(trip.id, (t) => ({ bagIds: t.bagIds.map((x) => (x === b.id ? to.id : x)), ...repack(b, to, t, state.items), ...bagLeaves(t, b.id, to.id) }))
                    }
                    return (
                      <div key={b.id} className="tripbag">
                        <span className="name truncate">{b.name}</span>
                        <span className="dim">{inBag(b, trip).placements.length + inBag(b, trip).loose.length} items</span>
                        <Menu label={`Swap ${b.name} for`} placeholder="Swap for…" onPick={swap} items={others.map((x) => ({ value: x.id, label: x.name }))} />
                        <IconButton icon="x" label={`Remove ${b.name} from trip`} title="Remove from trip; its items return to the schedule" onClick={() => { api.snap(`Took ${b.name} off the trip`); api.patchTrip(trip.id, (t) => ({ bagIds: t.bagIds.filter((id) => id !== b.id), ...dropBag(b, t), ...bagLeaves(t, b.id) })) }} />
                        <Reserve bag={b} trip={trip} onChange={(reserve) => patch({ reserve })} />
                      </div>
                    )
                  })}
                  {state.bags.some((b) => !trip.bagIds.includes(b.id)) ? (
                    <Menu label="Add a bag" placeholder="Add a bag…" onPick={(id) => patch({ bagIds: [...trip.bagIds, id] })} items={state.bags.filter((b) => !trip.bagIds.includes(b.id)).map((b) => ({ value: b.id, label: b.name }))} />
                  ) : !trip.bagIds.length && <span className="hint">No bags yet. Add one under Bags.</span>}
                  <SharedLimits trip={trip} bags={tripBags(trip, state.bags)} onChange={(shared) => { if (shared.length < (trip.shared?.length ?? 0)) api.snap('Removed the shared limit'); patch({ shared }) }} />
                </div>
              </div>
              <h3 className="form-sec">Conditions</h3>
              <Field label="Weather" span={6} group><Seg label="Weather" options={CLIMATES} value={trip.climate} onChange={(climate) => patch({ climate })} /></Field>
              <Field label="Kind of trip" span={6} group><Seg label="Kind of trip" options={KINDS} value={trip.kind} onChange={(kind) => patch({ kind })} /></Field>
              <Field label="Activities" span={12} group>
                <ActivityChips value={trip.activities} onToggle={toggleAct} />
              </Field>
            </FormCard>
            )}

            <div className="checklist">
              <div className="page-head">
                <h2>Checklist</h2>
                <span className="label">{trip.checklist.filter((c) => isPacked(c, trip, state.items)).length} of {trip.checklist.length} packed</span>
                {/* The same test as the plan's postmark: everything packed and every bag within its limits. */}
                {tripReady(trip, state.bags, state.items) && <span className="tag blue ready" role="status">Ready to travel</span>}
              </div>
              <div className="cluster">
                {!draft && <button className="btn primary" type="button" onClick={() => setDraft(true)}><Icon name="plus" />Add</button>}
                <button className="btn" type="button" onClick={regenerate}>Suggest from trip</button>
                {state.templates.length > 0 && <Menu label="Add a template to the list" placeholder="Add a template…" items={state.templates.map((t) => ({ value: t.id, label: t.name, hint: `${t.entries.length} items` }))} onPick={(id) => {
                  const t = state.templates.find((x) => x.id === id)
                  if (!t) return
                  const next = addTemplate(trip.checklist, t, state.items)
                  const n = next.length - trip.checklist.length
                  if (!n) return setMsg({ text: `The list already has everything in ${t.name}.` })
                  api.snap(`Added ${n} from ${t.name}`)
                  patch({ checklist: next })
                  setMsg(null)
                }} />}
                <button className={'btn' + (busy ? ' busy' : '')} type="button" onClick={askAi} aria-busy={busy}><Icon name="spark" />{busy ? 'Asking Claude…' : 'Ask Claude for extras'}</button>
                {msg && <span className={'msg' + (msg.red ? ' red' : '')} role="status">{msg.text}</span>}
              </div>
              {draft && <EntryForm items={state.items} onClose={() => setDraft(false)} onAdd={(e) => { api.patchTrip(trip.id, (t) => ({ checklist: [{ ...e, id: uid(), packed: false, source: 'manual' }, ...t.checklist] })); setDraft(false) }} />}
              <div className="table">
                {trip.checklist.map((c) => {
                  const linked = linkedItems(c, state.items)
                  const units = entryUnits(c, trip, state.items)
                  const packed = isPacked(c, trip, state.items)
                  const setLink = (itemIds: string[]) => api.patchTrip(trip.id, (t) => ({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, itemIds } : x)) }))
                  return (
                    <CheckRow key={c.id} className={packed ? 'done' : undefined} category={c.category} color={linked[0]?.color} label={c.label}
                      // Ticking happens on the plan; here the mark only reports: packed, how many of how many, or not owned.
                      lead={<Progress done={packed} units={units} qty={c.qty} owned={linked.length > 0} />}
                      count={c.packed && !linked.length ? 'Ticked' : linked.length ? `${units} of ${c.qty}` : 'Not in inventory'}
                      tag={c.source === 'ai' ? <span className="tag blue">Claude</span> : c.source === 'manual' ? <span className="tag">Yours</span> : undefined}
                      open={openRow === c.id} onToggle={() => setOpenRow(openRow === c.id ? null : c.id)}
                      onRemove={() => { api.snap(`Removed ${c.label}`); api.patchTrip(trip.id, (t) => ({ checklist: t.checklist.filter((x) => x.id !== c.id) })) }}>
                      <span className="hint">{c.note ? `${c.note}. ` : ''}{linked.length ? (c.itemIds ? 'Packed when these are in a bag:' : 'Matched by name. Packed when these are in a bag:') : 'Link it to something you own, or tick it off on the plan.'}</span>
                      <LinkPicker entry={c} items={state.items} onChange={setLink} />
                    </CheckRow>
                  )
                })}
                {!trip.checklist.length && <Blank art="list" title="The list is empty">Suggest one from the trip, or add your own.</Blank>}
              </div>
            </div>
          </>
        )}
      </div>
      </>}
    </section>
  )
}

/** A trip's Shared Limits: which of its bags each one covers, and the limit in kg. A bag is in at most one, and each covers at least two. */
function SharedLimits({ trip, bags, onChange }: { trip: Trip; bags: Bag[]; onChange: (s: SharedLimit[]) => void }) {
  const shared = trip.shared ?? []
  const free = bags.filter((b) => !shared.some((s) => s.bagIds.includes(b.id)))
  const edit = (id: string, patch: Partial<SharedLimit>) => onChange(shared.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  return (
    <>
      {shared.map((s) => (
        <div key={s.id} className="shared-edit" role="group" aria-label="Shared limit">
          <span className="label">Shared</span>
          <span className="radios">
            {bags.map((b) => {
              const on = s.bagIds.includes(b.id)
              const taken = !on && !free.includes(b)
              const last = on && s.bagIds.length <= 2
              return (
                <label key={b.id} className="chip" title={taken ? 'Already in another shared limit' : last ? 'A shared limit covers at least two bags' : undefined}>
                  <input type="checkbox" checked={on} disabled={taken || last} onChange={() => edit(s.id, { bagIds: trip.bagIds.filter((id) => (id === b.id ? !on : s.bagIds.includes(id))) })} />{b.name}
                </label>
              )
            })}
          </span>
          <UnitInput unit="kg" min={0.1} step={0.1} value={s.limit / 1000} onChange={(e) => edit(s.id, { limit: Math.round(Number(e.target.value) * 1000) })} aria-label={`Shared limit in ${shownUnit('kg')}`} required />
          <IconButton icon="x" label="Remove shared limit" onClick={() => onChange(shared.filter((x) => x.id !== s.id))} />
        </div>
      ))}
      {free.length >= 2 && (
        <button className="btn text share-add" type="button" onClick={() => onChange([...shared, { id: uid(), bagIds: free.slice(0, 2).map((b) => b.id), limit: 10000 }])}><Icon name="plus" />Share a limit</button>
      )}
    </>
  )
}

/** A bag's Reserve on a trip: litres and kg kept free for the way home. Both empty or zero means none. */
function Reserve({ bag, trip, onChange }: { bag: Bag; trip: Trip; onChange: (r: Trip['reserve']) => void }) {
  const { [bag.id]: mine = { volume: 0, weight: 0 }, ...rest } = trip.reserve ?? {}
  const set = (p: Partial<typeof mine>) => { const next = { ...mine, ...p }; onChange(next.volume > 0 || next.weight > 0 ? { ...rest, [bag.id]: next } : rest) }
  // Folded away until asked for; once set it stays open.
  const [open, setOpen] = useState(false)
  if (!open && !mine.volume && !mine.weight) return <div className="reserve"><button type="button" className="btn text" onClick={() => setOpen(true)}><Icon name="plus" />Keep room free</button></div>
  return (
    <div className="reserve" role="group" aria-label={`Kept free in ${bag.name}`}>
      <span className="label">Keep free</span>
      <UnitInput unit="L" min={0} step={0.5} autoFocus={open} value={mine.volume / 1000} onChange={(e) => set({ volume: Math.max(0, Math.round(Number(e.target.value) * 1000)) })} aria-label={`Volume kept free in ${bag.name}, litres`} />
      <UnitInput unit="kg" min={0} step={0.1} value={mine.weight / 1000} onChange={(e) => set({ weight: Math.max(0, Math.round(Number(e.target.value) * 1000)) })} aria-label={`Weight kept free in ${bag.name}, ${shownUnit('kg')}`} />
      <span className="hint">for the way home</span>
      <IconButton icon="x" label={`Keep nothing free in ${bag.name}`} onClick={() => { onChange(rest); setOpen(false) }} />
    </div>
  )
}

/** What a checklist entry's mark reports on the trip page: a tick when packed, a small bar of units for linked items, a dash when not owned. */
function Progress({ done, units, qty, owned }: { done: boolean; units: number; qty: number; owned: boolean }) {
  if (done) return <span className="glyph done" aria-label="packed"><Icon name="check" /></span>
  if (!owned) return <span className="glyph none" aria-label="not in inventory" />
  const n = Math.min(qty, 6), f = (units / qty) * n
  return <span className="glyph units" aria-label={`${units} of ${qty} packed`}>{Array.from({ length: n }, (_, i) => <i key={i} className={i < Math.floor(f) ? 'on' : ''} />)}</span>
}
