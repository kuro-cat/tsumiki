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

/** Pointer-down handler that drags a number: every 6 px sideways is one step (ten with Shift), kept within min and max.
 *  Steps are in the unit shown, so inches and ounces move evenly; it reports like an input would, with the metric value in target.value. */
export function dragToChange(unit: string, { value, min, max, step, disabled, onChange }: Pick<InputHTMLAttributes<HTMLInputElement>, 'value' | 'min' | 'max' | 'step' | 'disabled' | 'onChange'>) {
  return (e: PointerEvent<HTMLElement>) => {
    if (disabled || !onChange || e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget, x0 = e.clientX, v0 = toShown(Number(value) || 0, unit), st = shownStep(unit) ?? (Number(step) || 1)
    el.setPointerCapture(e.pointerId)
    const move = (m: globalThis.PointerEvent) => {
      let v = fromShown(Number((v0 + Math.round((m.clientX - x0) / 6) * st * (m.shiftKey ? 10 : 1)).toFixed(4)), unit)
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
  return <span className="unit"><MeasureInput unit={unit} {...input} /><span className="dim scrub" onPointerDown={dragToChange(unit, input)} title="Drag to change" aria-hidden="true">{shownUnit(unit)}</span></span>
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
export function Popover({ label, face, className, disabled, children }: { label: string; face: ReactNode; className?: string; disabled?: boolean; children: (close: () => void) => ReactNode }) {
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
    window.addEventListener('pointerdown', down)
    return () => window.removeEventListener('pointerdown', down)
  }, [open])
  return (
    // Escape closes the panel and stops there, so it never also reaches whatever holds the popover (the plan clears its selection on Escape).
    <div className={'popover' + (className ? ` ${className}` : '')} ref={ref} onKeyDown={(e) => { if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() } }} onBlur={(e) => { if (open && e.relatedTarget && !ref.current?.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <button ref={key} type="button" className="pop-key" aria-label={label} aria-expanded={open} aria-haspopup="dialog" disabled={disabled} onClick={() => setOpen((o) => !o)}>{face}<Icon name="chev" /></button>
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

/** Arrow keys, Home and End move focus through a dropdown's options. */
const listKeys = (e: KeyboardEvent<HTMLElement>) => {
  const opts = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-opt]:not(:disabled)')]
  const i = opts.indexOf(document.activeElement as HTMLButtonElement)
  const n = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? opts.length - 1 : null
  if (n == null || !opts.length) return
  e.preventDefault()
  opts[(n + opts.length) % opts.length].focus()
}

/** One choice in a dropdown: what it's called, and optionally a pictogram before it and a note after it. `group` starts a new heading in a menu. */
export type Opt<T extends string = string> = { value: T; label: string; icon?: ReactNode; hint?: string; group?: string }

/** A dropdown that holds a value: the key shows the current option, the panel lists them all. */
export function Choice<T extends string>({ label, value, options, onChange, className }: { label: string; value: T; options: Opt<T>[]; onChange: (v: T) => void; className?: string }) {
  const cur = options.find((o) => o.value === value)
  return (
    <Popover label={`${label}: ${cur?.label ?? 'none'}`} className={'choice' + (className ? ` ${className}` : '')} face={<span className="choice-face">{cur?.icon}<span className="truncate">{cur?.label}</span></span>}>
      {(close) => (
        <div className="opts" role="listbox" aria-label={label} onKeyDown={listKeys}>
          {options.map((o) => (
            <button key={o.value} type="button" role="option" data-opt aria-selected={o.value === value} autoFocus={o.value === value} className="opt" onClick={() => { onChange(o.value); close() }}>
              {o.icon}<span className="opt-label">{o.label}</span>{o.hint && <span className="dim">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}

/** A dropdown that runs an action: the key shows what it does, and picking an item calls onPick. Disabled when there's nothing to pick. */
export function Menu({ label, placeholder, items, onPick, disabled, className = 'act' }: { label: string; placeholder?: ReactNode; items: Opt[]; onPick: (value: string) => void; disabled?: boolean; className?: string }) {
  return (
    <Popover label={label} disabled={disabled || !items.length} className={'menu' + (className ? ` ${className}` : '')} face={placeholder && <span className="truncate">{placeholder}</span>}>
      {(close) => (
        <div className="opts" role="menu" aria-label={label} onKeyDown={listKeys}>
          {items.map((it, i) => (
            <Fragment key={it.value}>
              {it.group && it.group !== items[i - 1]?.group && <span className="opt-group" role="presentation">{it.group}</span>}
              <button type="button" role="menuitem" data-opt autoFocus={i === 0} className="opt" onClick={() => { close(); onPick(it.value) }}>
                {it.icon}<span className="opt-label">{it.label}</span>{it.hint && <span className="dim">{it.hint}</span>}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </Popover>
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
