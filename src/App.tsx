import { useState } from 'react'
import { repack, useStore, type Api, type State } from './store'
import { Plan } from './views/Plan'
import { Inventory } from './views/Inventory'
import { Bags } from './views/Bags'
import { Trips } from './views/Trips'
import { Data } from './views/Data'

const TABS = ['Plan', 'Inventory', 'Bags', 'Trips', 'Data'] as const
export type Tab = (typeof TABS)[number]
export type ViewProps = { state: State; api: Api; go: (t: Tab) => void }
export type PlanView = 'plan' | '3d'

export default function App() {
  const [state, api] = useStore()
  const [tab, setTab] = useState<Tab>('Plan')
  const [view, setView] = useState<PlanView>('plan')
  const trip = state.trips.find((t) => t.id === state.activeTripId) ?? null

  const changeBag = (bagId: string) => {
    if (!trip) return
    const bag = state.bags.find((b) => b.id === bagId)
    api.patchTrip(trip.id, (t) => ({ bagId: bag?.id ?? null, placements: bag ? repack(bag, t, state.items) : [] }))
  }

  return (
    <div className="app">
      <header className="top">
        <span className="wordmark">BIN-PACK</span>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t} className="tab" aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
        {tab === 'Plan' && trip && (
          <div className="ctl">
            <select aria-label="Trip" value={trip.id} onChange={(e) => api.set({ activeTripId: e.target.value })}>
              {state.trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select aria-label="Bag" value={trip.bagId ?? ''} onChange={(e) => changeBag(e.target.value)}>
              <option value="">No bag</option>
              {state.bags.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <div className="seg" role="group" aria-label="View">
              <button aria-pressed={view === 'plan'} onClick={() => setView('plan')}>Plan</button>
              <button aria-pressed={view === '3d'} onClick={() => setView('3d')}>3D</button>
            </div>
          </div>
        )}
      </header>
      <main className="main">
        {tab === 'Plan' && <Plan state={state} api={api} go={setTab} view={view} />}
        {tab === 'Inventory' && <Inventory state={state} api={api} go={setTab} />}
        {tab === 'Bags' && <Bags state={state} api={api} go={setTab} />}
        {tab === 'Trips' && <Trips state={state} api={api} go={setTab} />}
        {tab === 'Data' && <Data state={state} api={api} go={setTab} />}
      </main>
    </div>
  )
}
