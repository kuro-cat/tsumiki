import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { CatIcon, Icon } from './Icon'
import { CATEGORIES, titleCase, type Category } from './store'
import { Choice, Popover, type Opt } from './ui'

/** A swatch choice: its value, a name for screen readers and tooltips, and the CSS colour it paints. */
export type Swatch = { value: string; name: string; paint: string }

// Custom colours keep to the Cool Earth rule: hues from ochre through greens to sea blue, never red-pink or purple.
export const HUE_MIN = 25, HUE_MAX = 215
const SAT = 34, LIGHT = 46
export const hueHex = (h: number) => {
  const s = SAT / 100, l = LIGHT / 100, a = s * Math.min(l, 1 - l)
  const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0') }
  return `#${f(0)}${f(8)}${f(4)}`
}
export const hexHue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b)
  if (!d) return HUE_MIN
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return Math.round(((h * 60) + 360) % 360)
}

/** A colour key that opens swatches, and with `custom` a hue strip for any colour in the allowed range. */
export function ColourPick({ label, value, swatches, custom, onChange }: { label: string; value: string; swatches: Swatch[]; custom?: boolean; onChange: (v: string) => void }) {
  const known = swatches.find((s) => s.value === value)
  const paint = known?.paint ?? (value || 'transparent')
  const hue = Math.min(HUE_MAX, Math.max(HUE_MIN, value && !known ? hexHue(value) : HUE_MIN))
  return (
    <Popover label={label} className="colour" face={<i className={'sw' + (paint === 'transparent' ? ' none' : '')} style={{ '--sw': paint } as CSSProperties} />}>
      {(close) => (
        <>
          <div className="swatches" role="radiogroup" aria-label={label}>
            {swatches.map((s) => (
              <button key={s.value} type="button" role="radio" aria-checked={s.value === value} title={s.name} aria-label={s.name} className="swatch" style={{ '--sw': s.paint } as CSSProperties}
                onClick={() => { onChange(s.value); close() }}><i className={'sw' + (s.paint === 'transparent' ? ' none' : '')} /></button>
            ))}
          </div>
          {custom && (
            <label className="hue">
              <span className="label">Custom</span>
              <input type="range" className={value && !known ? undefined : 'unset'} min={HUE_MIN} max={HUE_MAX} value={hue} onChange={(e) => onChange(hueHex(Number(e.target.value)))} aria-label="Custom colour hue"
                style={{ '--track': `linear-gradient(to right, ${[0, 1, 2, 3, 4, 5, 6].map((i) => hueHex(HUE_MIN + ((HUE_MAX - HUE_MIN) * i) / 6)).join(', ')})` } as CSSProperties} />
            </label>
          )}
        </>
      )}
    </Popover>
  )
}

const CATEGORY_OPTS: Opt<Category>[] = CATEGORIES.map((c) => ({ value: c, label: titleCase(c), icon: <CatIcon it={{ category: c }} /> }))
/** Category as a dropdown of pictograms and names. */
export const CategoryPick = ({ value, onChange, label = 'Category' }: { value: Category; onChange: (c: Category) => void; label?: string }) =>
  <Choice label={label} value={value} options={CATEGORY_OPTS} onChange={onChange} />

// Dates as local calendar days: 'YYYY-MM-DD' in and out, never through UTC, so a day never slips across midnight.
const day = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plus = (s: string, n: number) => { const d = day(s); d.setDate(d.getDate() + n); return ymd(d) }
const short = (s: string) => day(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Leave and return dates in one field. The calendar takes the first pick as the day you leave and the next later pick as the day you're back. */
export function DateRange({ start, end, onChange }: { start: string; end: string; onChange: (start: string, end: string) => void }) {
  const n = Math.max(1, Math.round((day(end).getTime() - day(start).getTime()) / 86400000))
  const face = <span className="range-face"><b>{short(start)}</b><Icon name="arrow" /><b>{short(end)}</b><span className="dim">{n} {n === 1 ? 'night' : 'nights'}</span></span>
  return <Popover label="Trip dates" className="dates" face={face}>{(close) => <Calendar start={start} end={end} onChange={onChange} close={close} />}</Popover>
}

function Calendar({ start, end, onChange, close }: { start: string; end: string; onChange: (start: string, end: string) => void; close: () => void }) {
  const [focus, setFocus] = useState(start)
  const [picking, setPicking] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const f = day(focus), first = new Date(f.getFullYear(), f.getMonth(), 1)
  const lead = (first.getDay() + 6) % 7
  const cells = Array.from({ length: Math.ceil((lead + new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate()) / 7) * 7 }, (_, i) => ymd(new Date(f.getFullYear(), f.getMonth(), i - lead + 1)))
  // While picking, the range runs from the first pick to the day under the pointer or focus.
  const from = picking ?? start, to = picking ? (hover && hover > picking ? hover : picking) : end
  const today = ymd(new Date())
  useEffect(() => { grid.current?.querySelector<HTMLButtonElement>(`[data-d="${focus}"]`)?.focus() }, [focus])
  const pick = (d: string) => {
    if (!picking || d <= picking) { setPicking(d); return }
    onChange(picking, d); close()
  }
  const move = (months: number) => { const d = day(focus); const want = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + months); d.setDate(Math.min(want, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); setFocus(ymd(d)) }
  const key = (e: KeyboardEvent) => {
    const by: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key in by) setFocus(plus(focus, by[e.key]))
    else if (e.key === 'PageUp') move(-1)
    else if (e.key === 'PageDown') move(1)
    else if (e.key === 'Home') setFocus(plus(focus, -((day(focus).getDay() + 6) % 7)))
    else if (e.key === 'End') setFocus(plus(focus, 6 - ((day(focus).getDay() + 6) % 7)))
    else return
    e.preventDefault()
  }
  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="btn quiet" aria-label="Previous month" onClick={() => move(-1)}><Icon name="arrow" /></button>
        <span className="cal-month" aria-live="polite">{f.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <button type="button" className="btn quiet" aria-label="Next month" onClick={() => move(1)}><Icon name="arrow" /></button>
      </div>
      <p className="hint">{picking ? 'Now pick the day you’re back.' : 'Pick the day you leave.'}</p>
      <div className="cal-grid" ref={grid} role="grid" aria-label="Dates" onKeyDown={key} onPointerLeave={() => setHover(null)}>
        {WEEK.map((w) => <span key={w} className="cal-wd" aria-hidden="true">{w[0]}</span>)}
        {cells.map((d) => {
          const out = day(d).getMonth() !== f.getMonth(), inRange = d >= from && d <= to, edge = d === from || d === to
          return (
            <button key={d} type="button" data-d={d} tabIndex={d === focus ? 0 : -1}
              className={'cal-day' + (out ? ' out' : '') + (inRange ? ' in' : '') + (edge ? ' edge' : '') + (d === today ? ' today' : '')}
              aria-pressed={edge} aria-label={day(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              onClick={() => { setFocus(d); pick(d) }} onPointerEnter={() => setHover(d)}>{day(d).getDate()}</button>
          )
        })}
      </div>
    </div>
  )
}
