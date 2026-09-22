import { useState, type ReactNode } from 'react'
import { CATEGORIES, DEFAULT_PACKS_TO, isoDate, KEY, type State } from '../store'
import type { ViewProps } from '../App'
import { AUTOPACK_ANIM_KEY, autopackAnimates } from './Plan'

export function Data({ state, api, theme }: ViewProps & { theme?: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; red?: boolean } | null>(null)
  const [anim, setAnim] = useState(autopackAnimates)
  const toggleAnim = (on: boolean) => { setAnim(on); try { localStorage.setItem(AUTOPACK_ANIM_KEY, on ? 'on' : 'off') } catch { /* session-only */ } }
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
      api.replace({ items: s.items, bags: s.bags, trips: s.trips, apiKey: state.apiKey, activeTripId: s.activeTripId ?? s.trips[0]?.id ?? null, packsTo: { ...DEFAULT_PACKS_TO, ...s.packsTo } })
      setMsg({ text: `Imported ${s.items.length} items, ${s.bags.length} bags, ${s.trips.length} trips.` })
    } catch {
      setMsg({ text: 'That file is not a Bin-pack export.', red: true })
    }
  }
  const removeSample = () => {
    const trips = state.trips.filter((t) => !t.sample)
    api.replace({ ...state, items: state.items.filter((i) => !i.sample), bags: state.bags.filter((b) => !b.sample), trips, activeTripId: trips.some((t) => t.id === state.activeTripId) ? state.activeTripId : trips[0]?.id ?? null })
    setMsg({ text: 'Sample data removed.' })
  }
  const reset = () => {
    if (!confirm('Delete everything Bin-pack stores in this browser? Export first if you want to keep it.')) return
    localStorage.removeItem(KEY)
    location.reload()
  }

  return (
    <section className="page">
      <div className="page-head"><h1>Data</h1><p className="muted">Everything lives in this browser. Nothing is sent anywhere unless you add a key below.</p></div>
      <div className="data">
        {theme && (
          <section className="phone-only">
            <h2>Paper</h2>
            <div className="tools">{theme}</div>
            <p className="hint">Vellum in a light room, Blueprint in a dark one, or follow the system.</p>
          </section>
        )}
        <section>
          <h2>Backup</h2>
          <div className="tools">
            <button className="btn" onClick={exportJson}>Export JSON</button>
            <label className="btn">Import JSON<input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => importJson(e.target.files?.[0])} /></label>
            {msg && <span className={'msg' + (msg.red ? ' red' : '')} role="status">{msg.text}</span>}
          </div>
          <p className="hint">Import replaces the current inventory, bags, and trips.</p>
        </section>
        <section>
          <h2>Claude API key</h2>
          <label className="field"><span className="label">Key</span><input type="password" value={state.apiKey} onChange={(e) => api.set({ apiKey: e.target.value.trim() })} placeholder="sk-ant-…" autoComplete="off" /></label>
          <p className="hint">Optional. Enables “Ask Claude for extras” on a trip. The key stays in this browser's storage and requests go straight from your browser to Anthropic, billed to your account. Rule-based suggestions work without it.</p>
        </section>
        <section>
          <h2>Packs-to defaults</h2>
          <div className="packs">
            {CATEGORIES.map((c) => (
              <label key={c} className="field"><span className="label">{c}</span><span className="unit"><input type="number" min={5} max={100} step={5} value={state.packsTo[c]} onChange={(e) => api.set({ packsTo: { ...state.packsTo, [c]: Number(e.target.value) } })} /><span className="dim">%</span></span></label>
            ))}
          </div>
          <p className="hint">How much of its measured volume a soft item takes once stuffed into a bag. Prefills new soft items by category; each item can override it.</p>
        </section>
        <section>
          <h2>Auto-pack</h2>
          <label className="chip" style={{ justifySelf: 'start' }}><input type="checkbox" checked={anim} onChange={(e) => toggleAnim(e.target.checked)} style={{ position: 'static', opacity: 1, width: 14, height: 14 }} />Animate items into the bag one by one</label>
          <p className="hint">Off places the whole batch at once. Follows your system's reduced-motion setting either way.</p>
        </section>
        <section>
          <h2>Sample data</h2>
          <div className="tools"><button className="btn" onClick={removeSample} disabled={!sampleCount}>Remove sample data</button><span className="hint">{sampleCount ? `${sampleCount} sample records` : 'None left'}</span></div>
        </section>
        <section>
          <h2>Start over</h2>
          <div className="tools"><button className="btn danger" onClick={reset}>Delete all local data</button></div>
        </section>
      </div>
    </section>
  )
}
