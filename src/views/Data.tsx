import { useState, type ReactNode } from 'react'
import { CATEGORIES, DEFAULT_PACKS_TO, type AiSettings, isoDate, KEY, sampleState, titleCase, type State } from '../store'
import type { ViewProps } from '../App'
import { autopackAnimates, setAutopackAnimates } from '../prefs'
import { Field, PageHead, Seg, UnitInput } from '../ui'

const PROVIDERS = ['anthropic', 'openai'] as const

export function Data({ state, api, theme, units }: ViewProps & { theme?: ReactNode; units: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; red?: boolean; at?: 'sample' } | null>(null)
  const [anim, setAnim] = useState(autopackAnimates)
  const toggleAnim = (on: boolean) => { setAnim(on); setAutopackAnimates(on) }
  const sampleCount = state.items.filter((i) => i.sample).length + state.bags.filter((b) => b.sample).length + state.trips.filter((t) => t.sample).length + state.templates.filter((t) => t.sample).length

  const ai = state.ai
  const setAi = (change: Partial<AiSettings>) => api.set({ ai: { ...ai, ...change } })

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ ...state, ai: { ...state.ai, key: '' } }, null, 2)], { type: 'application/json' })
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
      api.replace({ items: s.items, bags: s.bags, trips: s.trips, templates: Array.isArray(s.templates) ? s.templates : [], ai: state.ai, activeTripId: s.activeTripId ?? s.trips[0]?.id ?? null, packsTo: { ...DEFAULT_PACKS_TO, ...s.packsTo } })
      setMsg(null)
    } catch {
      setMsg({ text: 'That file is not a Bin-pack export.', red: true })
    }
  }
  const removeSample = () => {
    const trips = state.trips.filter((t) => !t.sample)
    api.snap('Removed sample data')
    api.replace({ ...state, items: state.items.filter((i) => !i.sample), bags: state.bags.filter((b) => !b.sample), trips, templates: state.templates.filter((t) => !t.sample), activeTripId: trips.some((t) => t.id === state.activeTripId) ? state.activeTripId : trips[0]?.id ?? null })
    setMsg(null)
  }
  const restoreSample = () => {
    const fresh = sampleState()
    const own = <T extends { sample?: boolean }>(xs: T[]) => xs.filter((x) => !x.sample)
    const trips = [...own(state.trips), ...fresh.trips]
    api.replace({ ...state, items: [...own(state.items), ...fresh.items], bags: [...own(state.bags), ...fresh.bags], trips, templates: [...own(state.templates), ...fresh.templates], activeTripId: trips.some((t) => t.id === state.activeTripId) ? state.activeTripId : fresh.activeTripId })
    setMsg({ text: `Sample data restored: ${fresh.items.length} items, ${fresh.bags.length} bags, ${fresh.trips.length} trip, ${fresh.templates.length} templates.`, at: 'sample' })
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
          <h2>AI suggestions</h2>
          <div className="cluster"><Seg label="Provider" options={PROVIDERS} value={ai.provider} onChange={(provider) => setAi({ provider })} names={{ anthropic: 'Anthropic', openai: 'OpenAI-compatible' }} /></div>
          <Field label="Key"><input type="password" value={ai.key} onChange={(e) => setAi({ key: e.target.value.trim() })} placeholder={ai.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'} autoComplete="off" /></Field>
          {ai.provider === 'openai' && <Field label="Base URL"><input type="url" value={ai.baseUrl} onChange={(e) => setAi({ baseUrl: e.target.value.trim() })} placeholder="https://opencode.ai/zen/go/v1" autoComplete="off" /></Field>}
          <Field label="Model"><input value={ai.model} onChange={(e) => setAi({ model: e.target.value.trim() })} placeholder={ai.provider === 'anthropic' ? 'claude-opus-5-5' : 'Required'} autoComplete="off" /></Field>
          <p className="hint">Optional, for “Ask AI for extras” on a trip. The key stays in this browser; requests go straight to the provider on your account. {ai.provider === 'openai' && 'Endpoints that block browser calls, such as OpenCode, work when the app runs from npm run dev or npm run preview.'}</p>
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
          <label className="chip" title="Items arrive in the bag one at a time"><input type="checkbox" checked={anim} onChange={(e) => toggleAnim(e.target.checked)} />Animate Auto-pack</label>
        </section>
        <section>
          <h2>Sample data</h2>
          <div className="cluster">
            <button className="btn" onClick={removeSample} disabled={!sampleCount}>Remove sample data</button>
            <button className="btn" onClick={restoreSample}>Restore sample data</button>
            {msg?.at === 'sample' ? <span className="msg" role="status">{msg.text}</span> : <span className="hint">{sampleCount ? `${sampleCount} sample records` : 'None left'}</span>}
          </div>
          <p className="hint">Restoring brings back the sample items, bags, Lisbon trip and templates. Your own stay as they are.</p>
        </section>
        <section>
          <h2>Start over</h2>
          <div className="cluster"><button className="btn danger" onClick={reset}>Delete all local data</button></div>
        </section>
      </div>
    </section>
  )
}
