import type { ReactNode } from 'react'
import { titleCase, type Category } from '../store'
import { ACTIVITIES } from '../lib/suggest'
import { CatIcon, Icon } from '../Icon'
import { Bike, Briefcase, Camera, MountainSnow, Signpost, Tent, Timer, WavesLadder, Wine, type LucideIcon } from 'lucide-react'

const ACT_ICON: Record<(typeof ACTIVITIES)[number], LucideIcon> = { hiking: Signpost, swimming: WavesLadder, running: Timer, photography: Camera, camping: Tent, 'formal event': Wine, work: Briefcase, cycling: Bike, skiing: MountainSnow }

/** The activities as toggle chips, each with its pictogram. */
export function ActivityChips({ value, onToggle }: { value: string[]; onToggle: (a: string) => void }) {
  return (
    <div className="radios">
      {ACTIVITIES.map((a) => { const I = ACT_ICON[a]; return <button key={a} type="button" className="chip ichip" aria-pressed={value.includes(a)} onClick={() => onToggle(a)}><I size={18} strokeWidth={1.75} aria-hidden="true" />{titleCase(a)}</button> })}
    </div>
  )
}

/** One line of a checklist, a trip's or a template's: what leads it (progress or quantity), the entry with its pictogram and a count,
 *  a tag after it, and more beneath when opened, ending in Remove. */
export function CheckRow({ lead, category, color, label, count, tag, open, onToggle, onRemove, className, children }: {
  lead: ReactNode; category: Category; color?: string; label: string; count: ReactNode; tag?: ReactNode; open: boolean; onToggle: () => void; onRemove: () => void; className?: string; children: ReactNode
}) {
  return (
    <div className={'check-row' + (className ? ` ${className}` : '')}>
      {lead}
      <button type="button" className="lbl" aria-expanded={open} onClick={onToggle}>
        <span className="entry"><CatIcon it={{ category, color }} /><span>{label}</span></span>
        <span className="count">{count}</span>
        <span className="chev" aria-hidden="true"><Icon name="chev" /></span>
      </button>
      {tag ?? <span />}
      {open && (
        <div className="more">
          {children}
          <div><button className="btn text" type="button" aria-label={`Remove ${label}`} onClick={onRemove}><Icon name="x" />Remove</button></div>
        </div>
      )}
    </div>
  )
}
