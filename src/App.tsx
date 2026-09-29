import { useEffect, useEffectEvent, useState } from 'react'
import { tripBags, useStore, type Api, type State } from './store'
import { Plan } from './views/Plan'
import { Inventory } from './views/Inventory'
import { Bags } from './views/Bags'
import { Trips } from './views/Trips'
import { Data } from './views/Data'
import { Choice, Seg, type Opt } from './ui'
import { Monitor, Moon, Share, Sun } from 'lucide-react'
import { shareTrip } from './views/plan/shareImage'
import { readTheme, readUnits, writeTheme, writeUnits, type Theme } from './prefs'
import { setUnits, type Units } from './lib/units'

const TABS = ['Plan', 'Inventory', 'Bags', 'Trips', 'Data'] as const
export type Tab = (typeof TABS)[number]
export type ViewProps = { state: State; api: Api; go: (t: Tab) => void }
export type PlanView = 'plan' | '3d'
const VIEWS: PlanView[] = ['plan', '3d']
const UNITS: Units[] = ['metric', 'imperial']
const THEMES: Opt<Theme>[] = [{ value: 'system', label: 'System', icon: <Monitor size={16} aria-hidden="true" /> }, { value: 'light', label: 'Light', icon: <Sun size={16} aria-hidden="true" /> }, { value: 'dark', label: 'Dark', icon: <Moon size={16} aria-hidden="true" /> }]

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

/** Display units live outside State too. Set during render so every formatter below reads the current choice. */
function useUnits() {
  const [units, set] = useState<Units>(readUnits)
  setUnits(units)
  return [units, (u: Units) => { writeUnits(u); set(u) }] as const
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
  const [units, chooseUnits] = useUnits()
  const trip = state.trips.find((t) => t.id === state.activeTripId) ?? null
  // Which of the trip's bags the sheet shows; falls back to the trip's first bag.
  const [shown, setShown] = useState<string | null>(null)
  const tb = trip ? tripBags(trip, state.bags) : []
  const worn = shown === 'worn'
  const bagId = worn ? null : tb.find((b) => b.id === shown)?.id ?? tb[0]?.id ?? null

  const themeSel = <Choice label="Theme" className="theme" value={theme} onChange={setTheme} options={THEMES} />
  return (
    <div className="app">
      <header className="top">
        <span className="wordmark">Tsumiki</span>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t} className="tab" aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
        {tab === 'Plan' && trip ? (
          <div className="ctl">
            <Choice label="Trip" className="trip-pick" value={trip.id} onChange={(id) => api.set({ activeTripId: id })} options={state.trips.map((t) => ({ value: t.id, label: t.name }))} />
            <button className="btn" onClick={() => shareTrip(trip, state.bags, state.items).catch(() => api.say("Couldn't make the image", true))} title="Send the trip's numbers and packing list as a picture">
              <Share size={16} strokeWidth={1.5} aria-hidden="true" />Share
            </button>
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
        {tab === 'Data' && <Data state={state} api={api} go={setTab} theme={themeSel} units={<Seg label="Units" options={UNITS} value={units} onChange={chooseUnits} />} />}
      </main>
      <Notices api={api} />
    </div>
  )
}
