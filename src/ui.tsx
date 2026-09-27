import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ChangeEvent, type ComponentProps, type FormEvent, type InputHTMLAttributes, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { converts, fromShown, lenUnit, shownMin, shownStep, shownUnit, titleCase, toShown } from './store'
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

/** Pointer-down handler that scrubs a number: every 6 px sideways is one step (ten with Shift), kept within min and max.
 *  It reports like an input would, with the metric value in target.value. */
export function scrubber({ value, min, max, step, disabled, onChange }: Pick<InputHTMLAttributes<HTMLInputElement>, 'value' | 'min' | 'max' | 'step' | 'disabled' | 'onChange'>) {
  return (e: PointerEvent<HTMLElement>) => {
    if (disabled || !onChange || e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget, x0 = e.clientX, v0 = Number(value) || 0, st = Number(step) || 1
    el.setPointerCapture(e.pointerId)
    const move = (m: globalThis.PointerEvent) => {
      let v = Number((v0 + Math.round((m.clientX - x0) / 6) * st * (m.shiftKey ? 10 : 1)).toFixed(4))
      if (min != null && min !== '') v = Math.max(Number(min), v)
      if (max != null && max !== '') v = Math.min(Number(max), v)
      onChange({ target: { value: String(v) } } as ChangeEvent<HTMLInputElement>)
    }
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)
  }
}

/** A number field with its unit inside the frame. Drag the unit sideways to change the value; arrows and typing work too. */
export function UnitInput({ unit, ...input }: { unit: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <span className="unit"><MeasureInput unit={unit} {...input} /><span className="dim scrub" onPointerDown={scrubber(input)} title="Drag to change" aria-hidden="true">{shownUnit(unit)}</span></span>
}

type Axis = 'l' | 'w' | 'h'
/** Length, width and height in one frame, read the way sizes are written: 50 × 32 × 20 cm. onChange gives each axis its handler. */
export function SizeInput({ label, value, names = { l: 'length', w: 'width', h: 'height' }, min = 0.5, step = 0.5, onChange }: {
  label: string; value: Record<Axis, number>; names?: Record<Axis, string>; min?: number; step?: number; onChange: (k: Axis) => (e: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <span className="size" role="group" aria-label={label}>
      {(['l', 'w', 'h'] as const).map((k, i) => (
        <Fragment key={k}>{i > 0 && <span className="x" aria-hidden="true">×</span>}<MeasureInput unit="cm" min={min} step={step} value={value[k]} onChange={onChange(k)} aria-label={`${label} ${names[k]}`} required /></Fragment>
      ))}
      <span className="dim">{lenUnit()}</span>
    </span>
  )
}

/** A whole number with − and + keys either side. */
export function Stepper({ label, value, min = 1, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (n: number) => void }) {
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, Math.round(n) || min))
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}><Icon name="minus" /></button>
      <input type="number" min={min} max={max} step={1} value={value} onChange={(e) => onChange(clamp(Number(e.target.value)))} aria-label={label} />
      <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={max != null && value >= max} onClick={() => onChange(clamp(value + 1))}><Icon name="plus" /></button>
    </span>
  )
}

/** A range slider with its value read out beside it; the filled part of the track is the value. */
export function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (n: number) => void }) {
  return (
    <span className="slider" style={{ '--pct': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} aria-valuetext={`${value} ${unit}`} />
      <output>{value}<span className="dim">{unit}</span></output>
    </span>
  )
}

/** A key that opens a small panel below it. Outside clicks and Escape close it; Escape and close() give focus back to the key. */
export function Popover({ label, face, className, children }: { label: string; face: ReactNode; className?: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [end, setEnd] = useState(false)
  const ref = useRef<HTMLDivElement>(null), key = useRef<HTMLButtonElement>(null)
  // A panel that would run past the form (or the screen) opens aligned to the key's right edge instead.
  useLayoutEffect(() => {
    const pop = ref.current?.querySelector<HTMLElement>('.pop')
    if (!open || !pop || !ref.current) return
    const room = (ref.current.closest('.form') ?? document.documentElement).getBoundingClientRect().right
    setEnd(ref.current.getBoundingClientRect().left + pop.offsetWidth > room - 8)
  }, [open])
  const close = () => { setOpen(false); key.current?.focus() }
  useEffect(() => {
    if (!open) return
    const down = (e: globalThis.PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); key.current?.focus() } }
    window.addEventListener('pointerdown', down); window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div className={'popover' + (className ? ` ${className}` : '')} ref={ref}>
      <button ref={key} type="button" className="pop-key" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>{face}<Icon name="chev" /></button>
      {open && <div className={'pop' + (end ? ' end' : '')} role="dialog" aria-label={label}>{children(close)}</div>}
    </div>
  )
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
