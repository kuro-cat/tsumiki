import { useState, type CSSProperties, type FormEvent } from 'react'
import { CLIMATES, KINDS, bagLeaves, dropBag, entryUnits, fmtDate, inBag, isPacked, linkedItems, newTrip, nights, repack, tripBags, uid, withLink, type Bag, type SharedLimit, type Trip } from '../store'
import { LinkPicker } from './LinkPicker'
import { ACTIVITIES, suggest } from '../lib/suggest'
import type { ViewProps } from '../App'
import { Icon } from '../Icon'

const COLS = { '--cols': 'minmax(0, 1fr) 120px 70px' } as CSSProperties

export function Trips({ state, api, go }: ViewProps) {
  const [editId, setEditId] = useState<string | null>(state.activeTripId)
  const trip = state.trips.find((t) => t.id === editId) ?? state.trips[0] ?? null
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; red?: boolean } | null>(null)
  const patch = (p: Partial<Trip>) => trip && api.patchTrip(trip.id, p)

  const startNew = () => {
    const t = newTrip(state.bags[0]?.id ?? null)
    api.upsertTrip(t)
    setEditId(t.id)
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
  const addManual = (e: FormEvent) => {
    e.preventDefault()
    const label = manual.trim()
    if (!trip || !label) return
    api.patchTrip(trip.id, (t) => ({ checklist: [...t.checklist, { ...withLink({ label, category: 'misc' as const, qty: 1, match: [label.toLowerCase()], source: 'manual' as const }, state.items), id: uid(), packed: false }] }))
    setManual('')
  }
  const toggleAct = (a: string) => trip && patch({ activities: trip.activities.includes(a) ? trip.activities.filter((x) => x !== a) : [...trip.activities, a] })
  const open = () => { if (trip) { api.set({ activeTripId: trip.id }); go('Plan') } }
  const remove = () => {
    if (!trip) return
    api.removeTrip(trip.id)
    setEditId(null)
  }

  return (
    <section className="page">
      <div className="page-head">
        <h1>Trips</h1>
        <p className="muted">Dates, weather, and activities make the checklist; the bags make the plan.</p>
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={startNew}><Icon name="plus" />New trip</button>
      </div>
      <div className="trip-grid">
        <div className="table">
          <div className="trow head" style={COLS}><span className="label">Trip</span><span className="label">Dates</span><span className="label num">Packed</span></div>
          {state.trips.map((t) => {
            const done = t.checklist.filter((c) => isPacked(c, t, state.items)).length
            return (
              <button key={t.id} type="button" className="trow" style={COLS} aria-current={trip?.id === t.id ? 'true' : undefined} onClick={() => { setEditId(t.id); setMsg(null) }}>
                <span className="name"><span>{t.name}{t.destination ? ` · ${t.destination}` : ''}</span>{t.sample && <span className="tag">sample</span>}</span>
                <span className="dim">{fmtDate(t.start)} – {fmtDate(t.end)}</span>
                <span className="num">{done} / {t.checklist.length}</span>
              </button>
            )
          })}
          {!state.trips.length && <div className="empty"><p>No trips yet.</p><button className="btn" onClick={startNew}>Start the first one</button></div>}
        </div>

        {trip && (
          <div style={{ display: 'grid', gap: 24 }}>
            <form className="form" onSubmit={(e) => e.preventDefault()} aria-label="Trip details">
              <label className="field s6"><span className="label">Name</span><input type="text" value={trip.name} onChange={(e) => patch({ name: e.target.value })} required /></label>
              <label className="field s6"><span className="label">Destination</span><input type="text" value={trip.destination} onChange={(e) => patch({ destination: e.target.value })} placeholder="City, country" /></label>
              <label className="field s3"><span className="label">Leave</span><input type="date" value={trip.start} onChange={(e) => patch({ start: e.target.value })} /></label>
              <label className="field s3"><span className="label">Return</span><input type="date" value={trip.end} min={trip.start} onChange={(e) => patch({ end: e.target.value })} /></label>
              <div className="field s12"><span className="label">Bags</span>
                <div className="tripbags">
                  {tripBags(trip, state.bags).map((b) => {
                    const others = state.bags.filter((x) => x.id !== b.id && !trip.bagIds.includes(x.id))
                    return (
                      <div key={b.id} className="tripbag">
                        <span className="name">{b.name}</span>
                        <span className="dim">{inBag(b, trip).placements.length + inBag(b, trip).loose.length} items</span>
                        <select className="act" aria-label={`Swap ${b.name} for`} value="" disabled={!others.length} onChange={(e) => { const to = state.bags.find((x) => x.id === e.target.value); if (to) api.patchTrip(trip.id, (t) => ({ bagIds: t.bagIds.map((id) => (id === b.id ? to.id : id)), ...repack(b, to, t, state.items), ...bagLeaves(t, b.id, to.id) })) }}>
                          <option value="">Swap for…</option>
                          {others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                        <button className="btn quiet" type="button" onClick={() => api.patchTrip(trip.id, (t) => ({ bagIds: t.bagIds.filter((id) => id !== b.id), ...dropBag(b, t), ...bagLeaves(t, b.id) }))} aria-label={`Remove ${b.name} from trip`} title="Remove from trip; its items return to the schedule"><Icon name="x" /></button>
                      </div>
                    )
                  })}
                  {state.bags.some((b) => !trip.bagIds.includes(b.id)) ? (
                    <select className="act" aria-label="Add a bag" value="" onChange={(e) => e.target.value && patch({ bagIds: [...trip.bagIds, e.target.value] })}>
                      <option value="">Add a bag…</option>
                      {state.bags.filter((b) => !trip.bagIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  ) : !trip.bagIds.length && <span className="hint">No bags yet. Add one under Bags.</span>}
                  <SharedLimits trip={trip} bags={tripBags(trip, state.bags)} onChange={(shared) => patch({ shared })} />
                </div>
              </div>
              <div className="field s6"><span className="label">Weather</span>
                <div className="seg" role="group" aria-label="Weather">{CLIMATES.map((c) => <button key={c} type="button" aria-pressed={trip.climate === c} onClick={() => patch({ climate: c })}>{c}</button>)}</div>
              </div>
              <div className="field s6"><span className="label">Kind of trip</span>
                <div className="seg" role="group" aria-label="Kind of trip">{KINDS.map((k) => <button key={k} type="button" aria-pressed={trip.kind === k} onClick={() => patch({ kind: k })}>{k}</button>)}</div>
              </div>
              <div className="field s12"><span className="label">Activities</span>
                <div className="radios">{ACTIVITIES.map((a) => <label key={a} className="chip"><input type="checkbox" checked={trip.activities.includes(a)} onChange={() => toggleAct(a)} />{a}</label>)}</div>
              </div>
              <div className="form-actions">
                <button className="btn primary" type="button" onClick={open}>Open the plan <Icon name="arrow" /></button>
                <span className="hint">{nights(trip)} nights</span>
                <div className="right"><button className="btn danger" type="button" onClick={remove}>Delete trip</button></div>
              </div>
            </form>

            <div style={{ display: 'grid', gap: 10 }}>
              <div className="page-head" style={{ gap: 10 }}>
                <h2>Checklist</h2>
                <span className="label">{trip.checklist.filter((c) => isPacked(c, trip, state.items)).length} / {trip.checklist.length} packed</span>
              </div>
              <div className="tools">
                <button className="btn" type="button" onClick={regenerate}>Suggest from trip</button>
                <button className={'btn' + (busy ? ' busy' : '')} type="button" onClick={askAi} aria-busy={busy}><Icon name="spark" />{busy ? 'Asking Claude…' : 'Ask Claude for extras'}</button>
                {msg && <span className={'msg' + (msg.red ? ' red' : '')} role="status">{msg.text}</span>}
              </div>
              <div className="check-list">
                {trip.checklist.map((c) => {
                  const linked = linkedItems(c, state.items)
                  const units = entryUnits(c, trip, state.items)
                  const packed = isPacked(c, trip, state.items)
                  const mark = packed ? ' on' : units > 0 ? ' half' : linked.length ? '' : ' miss'
                  const setLink = (itemIds: string[]) => api.patchTrip(trip.id, (t) => ({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, itemIds } : x)) }))
                  return (
                    <div key={c.id} className={'check-row' + (packed ? ' done' : '')}>
                      <span className={'mark' + mark} aria-label={packed ? 'packed' : units > 0 ? 'partly packed' : linked.length ? 'in inventory' : 'not in inventory'} />
                      <span className="lbl">
                        <span>{c.label}</span>
                        <small>{c.packed && !linked.length ? 'ticked' : linked.length ? `${units} / ${c.qty}` : c.note ?? 'not in inventory'}{c.itemIds ? '' : linked.length ? ' · guessed' : ''}</small>
                        <LinkPicker entry={c} items={state.items} onChange={setLink} />
                      </span>
                      {c.source === 'rule' ? <span /> : <span className={'tag' + (c.source === 'ai' ? ' blue' : '')}>{c.source}</span>}
                      <button className="btn quiet" type="button" onClick={() => api.patchTrip(trip.id, (t) => ({ checklist: t.checklist.filter((x) => x.id !== c.id) }))} aria-label={`Remove ${c.label}`}><Icon name="x" /></button>
                    </div>
                  )
                })}
                {!trip.checklist.length && <div className="empty"><p>Empty. Suggest from the trip, or add your own below.</p></div>}
              </div>
              <form className="add-row" onSubmit={addManual}>
                <label className="field" style={{ flex: 1 }}><span className="label">Add your own</span><input type="text" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Gift for the hosts" /></label>
                <button className="btn" type="submit" disabled={!manual.trim()}>Add</button>
              </form>
            </div>
          </div>
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
          <button className="btn quiet" type="button" onClick={() => onChange(shared.filter((x) => x.id !== s.id))} aria-label="Remove shared limit"><Icon name="x" /></button>
        </div>
      ))}
      {free.length >= 2 && (
        <button className="btn text share-add" type="button" onClick={() => onChange([...shared, { id: uid(), bagIds: free.slice(0, 2).map((b) => b.id), limit: 10000 }])}><Icon name="plus" />Share a limit</button>
      )}
    </>
  )
}
