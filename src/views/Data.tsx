import { useState, type ReactNode } from 'react'
import { CATEGORIES, DEFAULT_PACKS_TO, isoDate, KEY, sampleState, titleCase, type State } from '../store'
import type { ViewProps } from '../App'
import { autopackAnimates, setAutopackAnimates } from '../prefs'
import { Field, PageHead, UnitInput } from '../ui'

export function Data({ state, api, theme, units }: ViewProps & { theme?: ReactNode; units: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; red?: boolean; at?: 'sample' } | null>(null)
  const [anim, setAnim] = useState(autopackAnimates)
  const toggleAnim = (on: boolean) => { setAnim(on); setAutopackAnimates(on) }
  const sampleCount = state.items.filter((i) => i.sample).length + state.bags.filter((b) => b.sample).length + state.trips.filter((t) => t.sample).length

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ ...state, apiKey: '' }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bin-pack-${isoDate(new Date())}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMsg({ text: 'Exported. The API key is never included.' })
  }
  const importJson = async (f: File | undefined) => {
    if (!f) return
    try {
      const s = JSON.parse(await f.text()) as Partial<State>
      if (!Array.isArray(s.items) || !Array.isArray(s.bags) || !Array.isArray(s.trips)) throw new Error()
      api.snap(`Imported ${s.items.length} items, ${s.bags.length} bags, ${s.trips.length} trips`)
      api.replace({ items: s.items, bags: s.bags, trips: s.trips, apiKey: state.apiKey, activeTripId: s.activeTripId ?? s.trips[0]?.id ?? null, packsTo: { ...DEFAULT_PACKS_TO, ...s.packsTo } })
      setMsg(null)
    } catch {
      setMsg({ text: 'That file is not a Bin-pack export.', red: true })
    }
  }
  const removeSample = () => {
    const trips = state.trips.filter((t) => !t.sample)
    api.snap('Removed sample data')
    api.replace({ ...state, items: state.items.filter((i) => !i.sample), bags: state.bags.filter((b) => !b.sample), trips, activeTripId: trips.some((t) => t.id === state.activeTripId) ? state.activeTripId : trips[0]?.id ?? null })
    setMsg(null)
  }
  const restoreSample = () => {
    const fresh = sampleState()
    const own = <T extends { sample?: boolean }>(xs: T[]) => xs.filter((x) => !x.sample)
    const trips = [...own(state.trips), ...fresh.trips]
    api.replace({ ...state, items: [...own(state.items), ...fresh.items], bags: [...own(state.bags), ...fresh.bags], trips, activeTripId: trips.some((t) => t.id === state.activeTripId) ? state.activeTripId : fresh.activeTripId })
    setMsg({ text: `Sample data restored: ${fresh.items.length} items, ${fresh.bags.length} bags, ${fresh.trips.length} trip.`, at: 'sample' })
  }
  const reset = () => {
    if (!confirm('Delete everything Bin-pack stores in this browser? Export first if you want to keep it.')) return
    localStorage.removeItem(KEY)
    location.reload()
  }

  return (
    <section className="page">
      <PageHead title="Data" meta="Stored in this browser only" />
      <div className="data">
        {theme && (
          <section className="phone-only">
            <h2>Theme</h2>
            <div className="cluster">{theme}</div>
          </section>
        )}
        <section>
          <h2>Units</h2>
          <div className="cluster">{units}</div>
          <p className="hint">Sizes in inches, weights in oz and lb. Volume stays in litres, and exports are metric either way.</p>
        </section>
        <section>
          <h2>Backup</h2>
          <div className="cluster">
            <button className="btn" onClick={exportJson}>Export JSON</button>
            <label className="btn">Import JSON<input type="file" accept="application/json,.json" hidden onChange={(e) => importJson(e.target.files?.[0])} /></label>
            {msg && !msg.at && <span className={'msg' + (msg.red ? ' red' : '')} role="status">{msg.text}</span>}
          </div>
          <p className="hint">Importing replaces everything here.</p>
        </section>
        <section>
          <h2>Claude API key</h2>
          <Field label="Key"><input type="password" value={state.apiKey} onChange={(e) => api.set({ apiKey: e.target.value.trim() })} placeholder="sk-ant-…" autoComplete="off" /></Field>
          <p className="hint">Optional, for “Ask Claude for extras” on a trip. The key stays in this browser; requests go straight to Anthropic on your account.</p>
        </section>
        <section>
          <h2>Packed size by category</h2>
          <div className="packs">
            {CATEGORIES.map((c) => (
              <Field key={c} label={titleCase(c)}><UnitInput unit="%" min={5} max={100} step={5} value={state.packsTo[c]} onChange={(e) => api.set({ packsTo: { ...state.packsTo, [c]: Number(e.target.value) } })} /></Field>
            ))}
          </div>
          <p className="hint">How much of its volume a soft item takes once squashed into a bag. New items start from these.</p>
        </section>
        <section>
          <h2>Auto-pack</h2>
          <label className="chip"><input type="checkbox" checked={anim} onChange={(e) => toggleAnim(e.target.checked)} />Animate items into the bag one by one</label>
        </section>
        <section>
          <h2>Sample data</h2>
          <div className="cluster">
            <button className="btn" onClick={removeSample} disabled={!sampleCount}>Remove sample data</button>
            <button className="btn" onClick={restoreSample}>Restore sample data</button>
            {msg?.at === 'sample' ? <span className="msg" role="status">{msg.text}</span> : <span className="hint">{sampleCount ? `${sampleCount} sample records` : 'None left'}</span>}
          </div>
          <p className="hint">Restoring brings back the sample items, bags and Lisbon trip. Your own stay as they are.</p>
        </section>
        <section>
          <h2>Start over</h2>
          <div className="cluster"><button className="btn danger" onClick={reset}>Delete all local data</button></div>
        </section>
      </div>
    </section>
  )
}
