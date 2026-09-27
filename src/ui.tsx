import { useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ChangeEvent, type ComponentProps, type FormEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import { converts, fromShown, shownMin, shownStep, shownUnit, titleCase, toShown } from './store'
import { Icon } from './Icon'

/** A labelled field on the form's 12-column grid. `group` makes it a div, for a set of controls one label can't wrap. */
export function Field({ label, span, group, children }: { label: ReactNode; span?: 1 | 2 | 3 | 4 | 6 | 12; group?: boolean; children: ReactNode }) {
  const className = 'field' + (span ? ` s${span}` : '')
  const body = <><span className="label">{label}</span>{children}</>
  return group ? <div className={className}>{body}</div> : <label className={className}>{body}</label>
}

/** A number input whose value and onChange are in `unit` (cm, g, kg, or anything else, passed through). In imperial it shows and takes in, oz or lb
 *  and reports back in metric, so forms stay metric. What's typed is kept while focused, and a field left alone never reports. */
export function MeasureInput({ unit, value, onChange, onBlur, min, step, ...input }: { unit: string } & InputHTMLAttributes<HTMLInputElement>) {
  const [draft, setDraft] = useState<string | null>(null)
  if (!converts(unit)) return <input type="number" value={value} onChange={onChange} onBlur={onBlur} min={min} step={step} {...input} />
  return <input type="number" {...input}
    min={min == null ? undefined : shownMin(Number(min), unit)} step={shownStep(unit)}
    value={draft ?? (value === '' || value == null ? '' : toShown(Number(value), unit))}
    // Forms only read target.value, so they get a stand-in event carrying the metric value.
    onChange={(e) => { setDraft(e.target.value); onChange?.({ target: { value: e.target.value === '' ? '' : String(fromShown(Number(e.target.value), unit)) } } as ChangeEvent<HTMLInputElement>) }}
    onBlur={(e) => { setDraft(null); onBlur?.(e) }} />
}

/** A number input with its unit after it. */
export function UnitInput({ unit, ...input }: { unit: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <span className="unit"><MeasureInput unit={unit} {...input} /><span className="dim">{shownUnit(unit)}</span></span>
}

export function IconButton({ icon, label, ...button }: { icon: ComponentProps<typeof Icon>['name']; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="btn quiet" aria-label={label} {...button}><Icon name={icon} /></button>
}

export function PageHead({ title, meta, actions }: { title: string; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {meta && <span className="label">{meta}</span>}
      {actions && <div className="right">{actions}</div>}
    </div>
  )
}

/** A form panel: title with a close key (or `head` in its place), the fields, then a row of actions. */
export function FormCard({ label, title, onSubmit, onClose, head, actions, children }: {
  label: string; title: ReactNode; onSubmit?: (e: FormEvent) => void; onClose?: () => void; head?: ReactNode; actions?: ReactNode; children: ReactNode
}) {
  return (
    <form className="form" onSubmit={onSubmit ?? ((e) => e.preventDefault())} aria-label={label}>
      <div className="form-title"><h2>{title}</h2>{head ?? <IconButton icon="x" label="Close" onClick={onClose} />}</div>
      {children}
      {actions && <div className="form-actions">{actions}</div>}
    </form>
  )
}

/** Segmented control: one pressed button per option. Every click reports, even on the pressed one. */
export function Seg<T extends string>({ label, options, value, onChange, names, className }: {
  label: string; options: readonly T[]; value: T; onChange: (v: T) => void; names?: Partial<Record<T, string>>; className?: string
}) {
  return (
    <div className={'seg' + (className ? ` ${className}` : '')} role="group" aria-label={label}>
      {options.map((o) => <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}>{names?.[o] ?? titleCase(o)}</button>)}
    </div>
  )
}

/** A select used as a menu: it always shows the placeholder, and picking an option runs onPick. */
export function ActionSelect({ label, placeholder, onPick, disabled, className = 'act', children }: {
  label: string; placeholder: string; onPick: (value: string) => void; disabled?: boolean; className?: string; children: ReactNode
}) {
  return (
    <select className={className} aria-label={label} value="" disabled={disabled} onChange={(e) => e.target.value && onPick(e.target.value)}>
      <option value="">{placeholder}</option>
      {children}
    </select>
  )
}

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
const tabsIn = (el: HTMLElement | null) => [...(el?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])]

/** Tabs anywhere inside, however nested. Arrow keys, Home and End move to a tab and select it; Tab reaches only the selected one. */
export function TabList({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  // One tab stop: the selected tab, or the first when none is.
  useLayoutEffect(() => {
    const tabs = tabsIn(ref.current)
    const stop = tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0]
    for (const t of tabs) t.tabIndex = t === stop ? 0 : -1
  })
  const onKeyDown = (e: KeyboardEvent) => {
    const tabs = tabsIn(ref.current), i = tabs.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    let next: number
    if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    else if (e.key in STEP) next = (i + STEP[e.key] + tabs.length) % tabs.length
    else return
    e.preventDefault()
    tabs[next].focus()
    tabs[next].click()
  }
  return <div ref={ref} className={className} role="tablist" aria-label={label} onKeyDown={onKeyDown}>{children}</div>
}

export function Tab({ selected, ...button }: { selected: boolean } & ComponentProps<'button'>) {
  return <button type="button" role="tab" aria-selected={selected} {...button} />
}

/** An add/edit form's state: closed, adding a blank, or editing an existing record. */
export function useEditor<T>(blank: () => T) {
  const [form, setForm] = useState(blank)
  const [mode, setMode] = useState<'closed' | 'new' | 'edit'>('closed')
  return {
    form, setForm, open: mode !== 'closed', editing: mode === 'edit',
    add: () => { setForm(blank()); setMode('new') },
    edit: (f: T) => { setForm(f); setMode('edit'); window.scrollTo({ top: 0, behavior: 'smooth' }) },
    close: () => { setForm(blank()); setMode('closed') },
  }
}
