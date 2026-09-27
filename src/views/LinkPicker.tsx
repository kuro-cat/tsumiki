import { linkedItems, type CheckItem, type Item } from '../store'
import { CatIcon, Icon } from '../Icon'
import { Menu } from '../ui'

/** Chips for an entry's linked items plus a select to add one. Any change pins the Link; 'none' pins it empty. */
export function LinkPicker({ entry, items, onChange }: { entry: Pick<CheckItem, 'label' | 'match' | 'itemIds'>; items: Item[]; onChange: (itemIds: string[]) => void }) {
  const linked = linkedItems(entry, items)
  const ids = linked.map((i) => i.id)
  const rest = items.filter((i) => !ids.includes(i.id)).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <span className={'links cluster tight' + (entry.itemIds ? '' : ' guess')}>
      {linked.map((i) => (
        <span key={i.id} className="chip">{i.name}<button type="button" onClick={() => onChange(ids.filter((x) => x !== i.id))} aria-label={`Unlink ${i.name}`}><Icon name="x" size={12} /></button></span>
      ))}
      <Menu label={`Link ${entry.label} to`} placeholder={linked.length ? 'Link another…' : 'Link to…'} onPick={(id) => onChange(id === '*none' ? [] : [...ids, id])}
        items={[...rest.map((i) => ({ value: i.id, label: i.name, icon: <CatIcon it={i} /> })), ...(entry.itemIds?.length === 0 ? [] : [{ value: '*none', label: 'None in inventory' }])]} />
    </span>
  )
}
