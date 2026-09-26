import { useState } from 'react'
import { Icon } from '../Icon'

/** One sortable column: its header label and the value rows are ordered by. null always sorts last. */
export type Col<T> = { label: string; num?: boolean; key: (x: T) => string | number | null }
type By = { col: number; dir: 1 | -1 }

const cmp = (a: string | number | null, b: string | number | null, dir: 1 | -1) =>
  a == null ? (b == null ? 0 : 1) : b == null ? -1 : (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true })) * dir

/** Header buttons that cycle a column ascending, descending, then back to the list's own order. */
export function useSort<T>(cols: Col<T>[]) {
  const [by, setBy] = useState<By | null>(null)
  const click = (col: number) => setBy((b) => (b?.col !== col ? { col, dir: 1 } : b.dir === 1 ? { col, dir: -1 } : null))
  const sort = (list: T[]) => (by ? [...list].sort((a, b) => cmp(cols[by.col].key(a), cols[by.col].key(b), by.dir)) : list)
  const head = cols.map((c, i) => {
    const on = by?.col === i
    return (
      <button key={c.label} type="button" className={'sort label' + (c.num ? ' num' : '') + (on ? ' on' : '')} onClick={() => click(i)}
        aria-label={`Sort by ${c.label}${on ? (by!.dir === 1 ? ', ascending' : ', descending') : ''}`}>
        {c.label}{on && <Icon name={by!.dir === 1 ? 'up' : 'down'} size={12} />}
      </button>
    )
  })
  return { sort, head, sorted: by ? cols[by.col].label : null, clear: () => setBy(null) }
}
