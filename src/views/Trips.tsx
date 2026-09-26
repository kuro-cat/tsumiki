import { useState, type FormEvent } from 'react'
import { CATEGORIES, CLIMATES, KINDS, bagLeaves, dropBag, entryUnits, fmtDate, inBag, isPacked, linkedItems, newTrip, nights, repack, tripBags, uid, withLink, titleCase, type Bag, type Category, type CheckItem, type SharedLimit, type Trip } from '../store'
import { LinkPicker } from './LinkPicker'
import { ACTIVITIES, suggest } from '../lib/suggest'
import type { ViewProps } from '../App'
import { CatIcon, Icon } from '../Icon'
import { Blank } from './Blank'
import { ActionSelect, Field, FormCard, IconButton, PageHead, Seg } from '../ui'



export function Trips({ state, api, go }: ViewProps) {
  const [editId, setEditId] = useState<string | null>(state.activeTripId)
  const trip = state.trips.find((t) => t.id === editId) ?? state.trips[0] ?? null
  // The Add form: link is '' to guess from the name, '*none' for not in the inventory, or an item id.
  const blankDraft = { label: '', category: 'misc' as Category, qty: 1, link: '', note: '' }
  const [draft, setDraft] = useState<typeof blankDraft | null>(null)
  // Details show as one summary until Edit; checklist rows open for linking on click.
  // A trip nobody has named yet opens straight into its details.
  const [editing, setEditing] = useState(() => !!trip && trip.name === 'New trip' && !trip.checklist.length)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; red?: boolean } | null>(null)
  const patch = (p: Partial<Trip>) => trip && api.patchTrip(trip.id, p)

  const startNew = () => {
    const t = newTrip(state.bags[0]?.id ?? null)
    api.upsertTrip(t)
    setEditId(t.id)
    setEditing(true)
    setMsg(null)
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
  const addEntry = (e: FormEvent) => {
    e.preventDefault()
    const label = draft?.label.trim()
    if (!trip || !draft || !label) return
    const base: Omit<CheckItem, 'id' | 'packed'> = { label, category: draft.category, qty: Math.max(1, draft.qty), match: [label.toLowerCase()], source: 'manual', ...(draft.note.trim() ? { note: draft.note.trim() } : {}) }
    const entry = draft.link === '' ? withLink(base, state.items) : { ...base, itemIds: draft.link === '*none' ? [] : [draft.link] }
    api.patchTrip(trip.id, (t) => ({ checklist: [{ ...entry, id: uid(), packed: false }, ...t.checklist] }))
    setDraft(null)
  }
  const toggleAct = (a: string) => trip && patch({ activities: trip.activities.includes(a) ? trip.activities.filter((x) => x !== a) : [...trip.activities, a] })
  const open = () => { if (trip) { api.set({ activeTripId: trip.id }); go('Plan') } }
  const remove = () => {
    if (!trip) return
    api.removeTrip(trip.id)
    setEditId(null)
  }

  return (
    <section className="page narrow">
      <PageHead title="Trips" actions={<button className="btn primary" onClick={startNew}><Icon name="plus" />New trip</button>} />
      {/* Trips as sheet tabs across the top; the chosen trip gets the full width below. */}
      {state.trips.length > 0 ? (
        <div className="trip-tabs cluster tight" role="tablist" aria-label="Trips">
          {state.trips.map((t) => {
            const done = t.checklist.filter((c) => isPacked(c, t, state.items)).length
            return (
              <button key={t.id} role="tab" type="button" className="bagtab" aria-selected={trip?.id === t.id} onClick={() => { setEditId(t.id); setEditing(false); setOpenRow(null); setMsg(null) }}>
                <span className="name truncate">{t.name}</span>
                <span className="num">{fmtDate(t.start)} · {done} of {t.checklist.length}</span>
              </button>
            )
          })}
        </div>
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
                </div>
              </div>
            ) : (
            <FormCard label="Trip details" title="Edit trip" head={<button type="button" className="btn primary" onClick={() => setEditing(false)}>Done</button>} actions={<>
              <span className="hint">{nights(trip)} nights</span>
              <div className="right"><button className="btn danger" type="button" onClick={remove}>Delete trip</button></div>
            </>}>
              <Field label="Name" span={6}><input type="text" value={trip.name} onChange={(e) => patch({ name: e.target.value })} required /></Field>
              <Field label="Destination" span={6}><input type="text" value={trip.destination} onChange={(e) => patch({ destination: e.target.value })} placeholder="City, country" /></Field>
              <Field label="Leave" span={6}><input type="date" value={trip.start} onChange={(e) => patch({ start: e.target.value })} /></Field>
              <Field label="Return" span={6}><input type="date" value={trip.end} min={trip.start} onChange={(e) => patch({ end: e.target.value })} /></Field>
              <Field label="Bags" span={12} group>
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
                        <ActionSelect label={`Swap ${b.name} for`} placeholder="Swap for…" disabled={!others.length} onPick={swap}>
                          {others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </ActionSelect>
                        <IconButton icon="x" label={`Remove ${b.name} from trip`} title="Remove from trip; its items return to the schedule" onClick={() => { api.snap(`Took ${b.name} off the trip`); api.patchTrip(trip.id, (t) => ({ bagIds: t.bagIds.filter((id) => id !== b.id), ...dropBag(b, t), ...bagLeaves(t, b.id) })) }} />
                      </div>
                    )
                  })}
                  {state.bags.some((b) => !trip.bagIds.includes(b.id)) ? (
                    <ActionSelect label="Add a bag" placeholder="Add a bag…" onPick={(id) => patch({ bagIds: [...trip.bagIds, id] })}>
                      {state.bags.filter((b) => !trip.bagIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </ActionSelect>
                  ) : !trip.bagIds.length && <span className="hint">No bags yet. Add one under Bags.</span>}
                  <SharedLimits trip={trip} bags={tripBags(trip, state.bags)} onChange={(shared) => { if (shared.length < (trip.shared?.length ?? 0)) api.snap('Removed the shared limit'); patch({ shared }) }} />
                </div>
              </Field>
              <Field label="Weather" span={12} group><Seg label="Weather" options={CLIMATES} value={trip.climate} onChange={(climate) => patch({ climate })} /></Field>
              <Field label="Kind of trip" span={12} group><Seg label="Kind of trip" options={KINDS} value={trip.kind} onChange={(kind) => patch({ kind })} /></Field>
              <Field label="Activities" span={12} group>
                <div className="radios">{ACTIVITIES.map((a) => <label key={a} className="chip"><input type="checkbox" checked={trip.activities.includes(a)} onChange={() => toggleAct(a)} />{titleCase(a)}</label>)}</div>
              </Field>
            </FormCard>
            )}

            <div className="checklist">
              <div className="page-head">
                <h2>Checklist</h2>
                <span className="label">{trip.checklist.filter((c) => isPacked(c, trip, state.items)).length} of {trip.checklist.length} packed</span>
              </div>
              <div className="cluster">
                {!draft && <button className="btn primary" type="button" onClick={() => setDraft(blankDraft)}><Icon name="plus" />Add</button>}
                <button className="btn" type="button" onClick={regenerate}>Suggest from trip</button>
                <button className={'btn' + (busy ? ' busy' : '')} type="button" onClick={askAi} aria-busy={busy}><Icon name="spark" />{busy ? 'Asking Claude…' : 'Ask Claude for extras'}</button>
                {msg && <span className={'msg' + (msg.red ? ' red' : '')} role="status">{msg.text}</span>}
              </div>
              {draft && (
                <FormCard label="Add to the checklist" title="Add to the list" onSubmit={addEntry} onClose={() => setDraft(null)} actions={<>
                  <button className="btn primary" type="submit" disabled={!draft.label.trim()}>Add to the list</button>
                  <button className="btn text" type="button" onClick={() => setDraft(null)}>Cancel</button>
                </>}>
                  <Field label="Name" span={6}><input type="text" autoFocus value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Gift for the hosts" required /></Field>
                  <Field label="Category" span={4}><select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}>{CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select></Field>
                  <Field label="Quantity" span={2}><input type="number" min={1} step={1} value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) })} required /></Field>
                  <Field label="Linked item" span={6}>
                    <select value={draft.link} onChange={(e) => { const it = state.items.find((i) => i.id === e.target.value); setDraft({ ...draft, link: e.target.value, ...(it ? { category: it.category } : {}) }) }}>
                      <option value="">Match by name</option>
                      {[...state.items].sort((a, b) => a.name.localeCompare(b.name)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                      <option value="*none">Nothing I own (tick it by hand)</option>
                    </select>
                  </Field>
                  <Field label={<>Note <span className="dim">optional</span></>} span={6}><input type="text" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Buy at the airport" /></Field>
                </FormCard>
              )}
              <div className="table">
                {trip.checklist.map((c) => {
                  const linked = linkedItems(c, state.items)
                  const units = entryUnits(c, trip, state.items)
                  const packed = isPacked(c, trip, state.items)
                  const setLink = (itemIds: string[]) => api.patchTrip(trip.id, (t) => ({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, itemIds } : x)) }))
                  return (
                    <div key={c.id} className={'check-row' + (packed ? ' done' : '')}>
                      {/* Ticking happens on the plan; here the mark only reports: packed, how many of how many, or not owned. */}
                      <Progress done={packed} units={units} qty={c.qty} owned={linked.length > 0} />
                      <button type="button" className="lbl" aria-expanded={openRow === c.id} onClick={() => setOpenRow(openRow === c.id ? null : c.id)}>
                        <span className="entry"><CatIcon it={{ category: c.category, color: linked[0]?.color }} /><span>{c.label}</span></span>
                        <span className="count">{c.packed && !linked.length ? 'Ticked' : linked.length ? `${units} of ${c.qty}` : 'Not in inventory'}</span>
                        <span className="chev" aria-hidden="true"><Icon name="chev" /></span>
                      </button>
                      {c.source === 'ai' ? <span className="tag blue">Claude</span> : c.source === 'manual' ? <span className="tag">Yours</span> : <span />}
                      {openRow === c.id && (
                        <div className="more">
                          <span className="hint">{c.note ? `${c.note}. ` : ''}{linked.length ? (c.itemIds ? 'Packed when these are in a bag:' : 'Matched by name. Packed when these are in a bag:') : 'Link it to something you own, or tick it off on the plan.'}</span>
                          <LinkPicker entry={c} items={state.items} onChange={setLink} />
                          <div><button className="btn text" type="button" onClick={() => { api.snap(`Removed ${c.label}`); api.patchTrip(trip.id, (t) => ({ checklist: t.checklist.filter((x) => x.id !== c.id) })) }}><Icon name="x" />Remove from the list</button></div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {!trip.checklist.length && <Blank art="list" title="The list is empty">Suggest one from the trip, or add your own.</Blank>}
              </div>
            </div>
          </>
        )}
      </div>
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
          <label className="unit"><input type="number" min={0.1} step={0.1} value={s.limit / 1000} onChange={(e) => edit(s.id, { limit: Math.round(Number(e.target.value) * 1000) })} aria-label="Shared limit in kg" required /><span className="dim">kg</span></label>
          <IconButton icon="x" label="Remove shared limit" onClick={() => onChange(shared.filter((x) => x.id !== s.id))} />
        </div>
      ))}
      {free.length >= 2 && (
        <button className="btn text share-add" type="button" onClick={() => onChange([...shared, { id: uid(), bagIds: free.slice(0, 2).map((b) => b.id), limit: 10000 }])}><Icon name="plus" />Share a limit</button>
      )}
    </>
  )
}

/** What a checklist entry's mark reports on the trip page: a tick when packed, a small bar of units for linked items, a dash when not owned. */
function Progress({ done, units, qty, owned }: { done: boolean; units: number; qty: number; owned: boolean }) {
  if (done) return <span className="glyph done" aria-label="packed"><Icon name="check" /></span>
  if (!owned) return <span className="glyph none" aria-label="not in inventory" />
  const n = Math.min(qty, 6), f = (units / qty) * n
  return <span className="glyph units" aria-label={`${units} of ${qty} packed`}>{Array.from({ length: n }, (_, i) => <i key={i} className={i < Math.floor(f) ? 'on' : ''} />)}</span>
}
