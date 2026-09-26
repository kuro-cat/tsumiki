import { fmtW, type Item, type Trip } from '../../store'
import { CatIcon } from '../../Icon'
import { IconButton } from '../../ui'
import { Blank } from '../Blank'

/** What the traveler wears on the day, one row per item. */
export function WornList({ trip, items, removeUnit }: { trip: Trip; items: Item[]; removeUnit: (itemId: string) => void }) {
  return (
    <div className="worn-list" aria-label="Worn items">
      <h2>Worn</h2>
      <p className="dim">On you on the day. Counts as packed, weighs nothing in any bag.</p>
      {Object.entries(trip.worn.reduce<Record<string, number>>((a, w) => ({ ...a, [w.itemId]: (a[w.itemId] ?? 0) + 1 }), {})).map(([id, n]) => {
        const it = items.find((i) => i.id === id)
        return it ? (
          <div key={id} className="worn-row">
            <CatIcon it={it} />
            <span className="name"><span className="truncate">{it.name}{n > 1 ? ` × ${n}` : ''}</span></span>
            <span className="num dim">{fmtW(it.weight * n)}</span>
            <IconButton icon="minus" label={`Take off ${it.name}`} title="Take one off" onClick={() => removeUnit(id)} />
          </div>
        ) : null
      })}
      {!trip.worn.length && <Blank art="worn" title="Nothing worn yet">Drag an item onto the Worn tab to wear it on the day.</Blank>}
    </div>
  )
}
