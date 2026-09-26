import { linkedItems, type CheckItem, type Item } from '../store'
import { Icon } from '../Icon'

/** Chips for an entry's linked items plus a select to add one. Any change pins the Link; 'none' pins it empty. */
export function LinkPicker({ entry, items, onChange, compact }: { entry: CheckItem; items: Item[]; onChange: (itemIds: string[]) => void; compact?: boolean }) {
  const linked = linkedItems(entry, items)
  const ids = linked.map((i) => i.id)
  const rest = items.filter((i) => !ids.includes(i.id)).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <span className={'links' + (entry.itemIds ? '' : ' guess')}>
      {!compact && linked.map((i) => (
        <span key={i.id} className="chip">{i.name}<button type="button" onClick={() => onChange(ids.filter((x) => x !== i.id))} aria-label={`Unlink ${i.name}`}><Icon name="x" size={12} /></button></span>
      ))}
      <select className="act" aria-label={`Link ${entry.label} to`} value="" onChange={(e) => onChange(e.target.value === '*none' ? [] : [...ids, e.target.value])}>
        <option value="">{linked.length ? 'Link another…' : 'Link to…'}</option>
        {rest.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        {entry.itemIds?.length === 0 ? null : <option value="*none">None in inventory</option>}
      </select>
    </span>
  )
}
