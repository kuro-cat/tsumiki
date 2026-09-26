import { useEffect, useEffectEvent, useState } from 'react'
import { tripBags, useStore, type Api, type State } from './store'
import { Plan } from './views/Plan'
import { Inventory } from './views/Inventory'
import { Bags } from './views/Bags'
import { Trips } from './views/Trips'
import { Data } from './views/Data'
import { Seg } from './ui'
import { readTheme, writeTheme, type Theme } from './prefs'

const TABS = ['Plan', 'Inventory', 'Bags', 'Trips', 'Data'] as const
export type Tab = (typeof TABS)[number]
export type ViewProps = { state: State; api: Api; go: (t: Tab) => void }
export type PlanView = 'plan' | '3d'
const VIEWS: PlanView[] = ['plan', '3d']

/** Theme lives outside State so exports stay about packing. index.html applies it before first paint; this keeps it current. */
function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme }
    apply()
    writeTheme(theme)
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
  return [theme, setTheme] as const
}

/** One notice at a time, pinned to the bottom of the screen so it's seen wherever the traveler is scrolled. Undo stays for 6 s. */
function Notices({ api }: { api: Api }) {
  const n = api.notice
  const dismiss = useEffectEvent(() => api.dismiss())
  useEffect(() => {
    if (!n) return
    const t = window.setTimeout(() => dismiss(), n.undo ? 6000 : 3000)
    return () => window.clearTimeout(t)
  }, [n])
  return (
    <div className="notices" role="status" aria-live="polite">
      {n && (
        <div key={n.n} className={'notice' + (n.red ? ' red' : '')}>
          <span>{n.text}</span>
          {n.undo && <button className="btn small" onClick={api.undo}>Undo</button>}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [state, api] = useStore()
  const [tab, setTab] = useState<Tab>('Plan')
  const [view, setView] = useState<PlanView>('plan')
  const [theme, setTheme] = useTheme()
  const trip = state.trips.find((t) => t.id === state.activeTripId) ?? null
  // Which of the trip's bags the sheet shows; falls back to the trip's first bag.
  const [shown, setShown] = useState<string | null>(null)
  const tb = trip ? tripBags(trip, state.bags) : []
  const worn = shown === 'worn'
  const bagId = worn ? null : tb.find((b) => b.id === shown)?.id ?? tb[0]?.id ?? null

  const themeSel = (
    <select className="theme" aria-label="Theme" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  )
  return (
    <div className="app">
      <header className="top">
        <span className="wordmark">Bin-pack</span>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t} className="tab" aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
        {tab === 'Plan' && trip ? (
          <div className="ctl">
            <select aria-label="Trip" value={trip.id} onChange={(e) => api.set({ activeTripId: e.target.value })}>
              {state.trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Seg label="View" options={VIEWS} value={view} onChange={setView} names={{ plan: 'Plan', '3d': '3D' }} />
            {themeSel}
          </div>
        ) : themeSel}
      </header>
      <main className="main">
        {tab === 'Plan' && <Plan state={state} api={api} go={setTab} view={view} setView={setView} bagId={bagId} worn={worn} show={setShown} />}
        {tab === 'Inventory' && <Inventory state={state} api={api} go={setTab} />}
        {tab === 'Bags' && <Bags state={state} api={api} go={setTab} />}
        {tab === 'Trips' && <Trips state={state} api={api} go={setTab} />}
        {tab === 'Data' && <Data state={state} api={api} go={setTab} theme={themeSel} />}
      </main>
      <Notices api={api} />
    </div>
  )
}
