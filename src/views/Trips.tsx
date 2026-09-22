import { useState, type FormEvent } from 'react'
import { CLIMATES, KINDS, dropBag, fmtDate, inBag, isPacked, matchItem, newTrip, nights, repack, tripBags, uid, type Trip } from '../store'
import { ACTIVITIES, suggest } from '../lib/suggest'
import type { ViewProps } from '../App'
import { Icon } from '../Icon'

const COLS = { gridTemplateColumns: 'minmax(0, 1fr) 120px 70px' }

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
        return { ...r, id: prev?.id ?? uid(), packed: prev?.packed ?? false }
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
      const fresh = extras.filter((e) => !trip.checklist.some((c) => c.label.toLowerCase() === e.label.toLowerCase())).map((e) => ({ ...e, id: uid(), packed: false }))
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
    api.patchTrip(trip.id, (t) => ({ checklist: [...t.checklist, { id: uid(), label, category: 'misc', qty: 1, match: [label.toLowerCase()], packed: false, source: 'manual' }] }))
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
                        <select aria-label={`Swap ${b.name} for`} value="" disabled={!others.length} onChange={(e) => { const to = state.bags.find((x) => x.id === e.target.value); if (to) api.patchTrip(trip.id, (t) => ({ bagIds: t.bagIds.map((id) => (id === b.id ? to.id : id)), ...repack(b, to, t, state.items) })) }}>
                          <option value="">Swap for…</option>
                          {others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                        <button className="btn quiet" type="button" onClick={() => api.patchTrip(trip.id, (t) => ({ bagIds: t.bagIds.filter((id) => id !== b.id), ...dropBag(b, t) }))} aria-label={`Remove ${b.name} from trip`} title="Remove from trip; its items return to the schedule"><Icon name="x" /></button>
                      </div>
                    )
                  })}
                  {state.bags.some((b) => !trip.bagIds.includes(b.id)) ? (
                    <select aria-label="Add a bag" value="" onChange={(e) => e.target.value && patch({ bagIds: [...trip.bagIds, e.target.value] })}>
                      <option value="">Add a bag…</option>
                      {state.bags.filter((b) => !trip.bagIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  ) : !trip.bagIds.length && <span className="hint">No bags yet. Add one under Bags.</span>}
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
                <button className="btn" type="button" onClick={open}>Open the plan <Icon name="arrow" /></button>
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
                  const m = matchItem(c, state.items)
                  const packed = isPacked(c, trip, state.items)
                  return (
                    <div key={c.id} className={'check-row' + (packed ? ' done' : '')}>
                      <span className={'mark' + (packed ? ' on' : m ? '' : ' miss')} aria-label={packed ? 'packed' : m ? 'in inventory' : 'not in inventory'} />
                      <span className="lbl">
                        <span>{c.label}{c.qty > 1 ? ` × ${c.qty}` : ''}</span>
                        <small>{m ? `${m.name} · ${m.qty} in inventory` : c.note ?? 'not in inventory'}</small>
                      </span>
                      <span className={'tag' + (c.source === 'ai' ? ' blue' : '')}>{c.source}</span>
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
