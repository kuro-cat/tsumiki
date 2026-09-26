import type { RefObject } from 'react'
import { bagTotals, fmtW, sharedTotals, type Bag, type Item, type Trip } from '../../store'
import { Tab, TabList } from '../../ui'

/** The trip's bags as tabs, with a shared limit's bags gathered in one bracket, then Worn. Items dropped on Worn are worn on the day. */
export function BagStrip({ trip, items, tb, bag, shared, worn, wornRef, wornHit, show }: {
  trip: Trip; items: Item[]; tb: Bag[]; bag: Bag | null; shared: ReturnType<typeof sharedTotals>; worn: boolean
  wornRef: RefObject<HTMLButtonElement | null>; wornHit: boolean; show: (id: string) => void
}) {
  if (!tb.length && !trip.worn.length) return null
  return (
    <TabList className="bagstrip" label="Bags on this trip">
      {tb.map((b) => {
        const tab = (b: Bag) => {
          const t = bagTotals(b, trip, items)
          return (
            <Tab key={b.id} selected={b.id === bag?.id} className={'bagtab' + (t.over || t.wState === 'over' ? ' red' : '')} onClick={() => show(b.id)}>
              <span className="name truncate">{b.name}</span>
              {b.id !== bag?.id && <span className="num">{fmtW(t.total)}</span>}
            </Tab>
          )
        }
        const sh = shared.find((x) => x.bagIds.includes(b.id))
        if (!sh) return tab(b)
        // A Shared Limit draws once, at its first bag in trip order, with its bags gathered beside it.
        const members = tb.filter((x) => sh.bagIds.includes(x.id))
        if (members[0].id !== b.id) return null
        return (
          <div key={sh.id} className={'share' + (sh.over ? ' over' : '')} role="presentation">
            <div className="share-tabs">{members.map(tab)}</div>
            <span className="share-cap">Together {fmtW(sh.total)} of {fmtW(sh.limit)}</span>
          </div>
        )
      })}
      <Tab ref={wornRef} selected={worn} className={'bagtab wornt' + (wornHit ? ' hit' : '')} onClick={() => show('worn')} title="Drop an item here to wear it">
        <span className="name truncate">Worn</span>
        <span className="num">{trip.worn.length}</span>
      </Tab>
    </TabList>
  )
}
