import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type ChangeEvent, type FormEvent, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react'
import { BLOCKS, CATEGORIES, bagVolume, fmtDim, fmtVol, fmtW, lenUnit, newBag, newCompartment, titleCase, type Bag, type Category, type Compartment } from '../store'
import type { ViewProps } from '../App'
import { CatIcon, Icon } from '../Icon'
import { useSort } from './Sort'
import { Blank } from './Blank'
import { Field, FormCard, IconButton, MeasureInput, PageHead, SizeInput, UnitInput, useEditor } from '../ui'
import { ColourPick, type Swatch } from '../pickers'

const blank = (): Bag => ({ ...newBag('', 50, 32, 20, 1200, null) })
const PRESETS = [
  { name: 'Carry-on', l: 52, w: 36, h: 18, empty: 2500, limit: 10000 },
  { name: 'Personal item', l: 40, w: 28, h: 15, empty: 800, limit: null },
  { name: 'Checked, medium', l: 68, w: 46, h: 26, empty: 3800, limit: 23000 },
  { name: 'Daypack 20 L', l: 42, w: 26, h: 16, empty: 600, limit: null },
]
const COLS = { '--cols': 'minmax(0, 2fr) 150px 90px 90px 90px 60px' } as CSSProperties
const main = (b: Bag) => b.compartments[0]
/** A compartment's colour choices: Auto (its colour by position) and the six blocks. */
const blockSwatches = (i: number): Swatch[] => [{ value: '', name: `Auto (${BLOCKS[i % 4][1]})`, paint: `var(--${BLOCKS[i % 4][0]})` }, ...BLOCKS.map(([k, n]) => ({ value: k, name: n, paint: `var(--${k})` }))]
type Num = 'l' | 'w' | 'h' | 'x' | 'y' | 'z'
const AXIS: Record<Num, string> = { l: 'L', w: 'W', h: 'D', x: 'X', y: 'Y', z: 'Z' }
const AXIS_NAME: Record<Num, string> = { l: 'length', w: 'width', h: 'depth', x: 'X position', y: 'Y position', z: 'Z position' }
// Edges are the plan's: the side of the drawing that sits against the traveler's back.
const HEAVY: [NonNullable<Bag['heavy']> | '', string][] = [['', 'Anywhere'], ['low', 'Low'], ['top', 'Low, top edge'], ['bottom', 'Low, bottom edge'], ['left', 'Low, left edge'], ['right', 'Low, right edge']]

export function Bags({ state, api }: ViewProps) {
  const ed = useEditor(blank)
  const { form, setForm, editing } = ed
  const set = <K extends keyof Bag>(k: K, v: Bag[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setComp = (id: string, patch: Partial<Compartment>) => set('compartments', form.compartments.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const numC = (id: string, k: Num) => (e: ChangeEvent<HTMLInputElement>) => setComp(id, { [k]: Number(e.target.value) })
  const toggleTakes = (c: Compartment, cat: Category) => { const t = c.takes?.includes(cat) ? c.takes.filter((x) => x !== cat) : [...(c.takes ?? []), cat]; setComp(c.id, { takes: t.length ? t : undefined }) }
  const addComp = () => {
    const last = form.compartments[form.compartments.length - 1]
    set('compartments', [...form.compartments, newCompartment(`Pocket ${form.compartments.length}`, 20, 12, 5, last ? last.x + last.l + 2 : 0, 0, 0)])
  }
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.compartments.length) return
    const { sample: _s, ...rest } = form
    api.upsertBag({ ...rest, name: form.name.trim(), compartments: form.compartments.map((c) => ({ ...c, name: c.name.trim() || 'Compartment' })) })
    ed.close()
  }
  const usedBy = (id: string) => state.trips.filter((t) => t.bagIds.includes(id)).length
  const by = useSort<Bag>([
    { label: 'Name', key: (b) => b.name },
    { label: `Main L × W × D ${lenUnit()}`, num: true, key: (b) => main(b).l * main(b).w * main(b).h },
    { label: 'Volume', num: true, key: bagVolume },
    { label: 'Empty', num: true, key: (b) => b.empty },
    { label: 'Limit', num: true, key: (b) => b.limit },
    { label: 'Trips', num: true, key: (b) => usedBy(b.id) },
  ])
  // Sorting is a view; your own order (which new trips start from) is only draggable while no column is sorted.
  const list = by.sort(state.bags)

  // Reorder by dragging the grip: the first bag is what a new trip starts with. Alt+arrows do the same from the keyboard.
  const listRef = useRef<HTMLDivElement>(null)
  const [lift, setLift] = useState<{ from: number; to: number } | null>(null)
  const grab = (e: RPointerEvent, from: number) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); setLift({ from, to: from }) }
  const drop = useEffectEvent(() => { setLift(null); if (lift && lift.from !== lift.to) api.moveBag(lift.from, lift.to) })
  const lifting = lift !== null
  useEffect(() => {
    if (!lifting) return
    const rows = () => [...(listRef.current?.querySelectorAll<HTMLElement>('.trow.bag') ?? [])]
    const mv = (e: PointerEvent) => {
      const mids = rows().map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 })
      let to = mids.findIndex((m) => e.clientY < m)
      if (to < 0) to = mids.length - 1
      setLift((l) => l && { ...l, to })
    }
    const up = () => drop()
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
  }, [lifting])
  const keyMove = (e: KeyboardEvent, i: number) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const to = e.key === 'ArrowUp' ? i - 1 : i + 1
    if (to >= 0 && to < state.bags.length) api.moveBag(i, to)
  }
  const applyPreset = (p: (typeof PRESETS)[number]) =>
    setForm((f) => ({ ...f, empty: p.empty, limit: p.limit, name: f.name || p.name, compartments: [{ ...f.compartments[0], name: 'Main', l: p.l, w: p.w, h: p.h }, ...f.compartments.slice(1)] }))

  return (
    <section className="page">
      <PageHead title="Bags" actions={!ed.open && <button className="btn primary" onClick={ed.add}><Icon name="plus" />Add bag</button>} />
      {ed.open && (
        <FormCard label={editing ? 'Edit bag' : 'Add bag'} title={editing ? form.name || 'Edit bag' : 'New bag'} onSubmit={save} onClose={ed.close} actions={<>
          <button className="btn primary" type="submit">{editing ? 'Save changes' : 'Add bag'}</button>
          <button className="btn text" type="button" onClick={ed.close}>Cancel</button>
          {editing && (
            <div className="right">
              <button className="btn danger" type="button" onClick={() => { api.removeBag(form.id); ed.close() }} title={usedBy(form.id) ? 'Trips using this bag will lose their placements' : undefined}>Delete bag</button>
            </div>
          )}
        </>}>
          {!editing && <div className="presets cluster">
            <span className="label">Start from</span>
            {PRESETS.map((p) => (
              <button key={p.name} type="button" className="chip" onClick={() => applyPreset(p)}>{p.name}<span className="dim">{fmtDim(p)}</span></button>
            ))}
            <span className="hint">Rough inside sizes. Check your airline's.</span>
          </div>}
          <Field label="Name" span={6}><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Travel backpack 40 L" required /></Field>
          <Field label="Empty weight" span={3}><UnitInput unit="kg" min={0} step={0.05} value={form.empty / 1000} onChange={(e) => set('empty', Math.round(Number(e.target.value) * 1000))} required /></Field>
          <Field label="Weight limit" span={3}><UnitInput unit="kg" min={0} step={0.5} value={form.limit == null ? '' : form.limit / 1000} onChange={(e) => set('limit', e.target.value === '' ? null : Math.round(Number(e.target.value) * 1000))} placeholder="none" /></Field>
          <Field label="Compartments" span={12} group>
            <div className="comps">
              {form.compartments.map((c, i) => (
                <div key={c.id} className="comp">
                  <input type="text" value={c.name} onChange={(e) => setComp(c.id, { name: e.target.value })} aria-label="Compartment name" placeholder={i === 0 ? 'Main' : 'Pocket'} />
                  <ColourPick label={`${c.name || 'Compartment'} colour`} value={c.color ?? ''} swatches={blockSwatches(i)} onChange={(v) => setComp(c.id, { color: (v || undefined) as Compartment['color'] })} />
                  <SizeInput label={c.name || 'Compartment'} value={c} names={AXIS_NAME} min={1} onChange={(k) => numC(c.id, k)} />
                  <IconButton icon="x" label={`Remove ${c.name}`} onClick={() => set('compartments', form.compartments.filter((x) => x.id !== c.id))} disabled={i === 0} title={i === 0 ? 'Every bag has a Main compartment' : 'Remove'} />
                  <div className="comp-more">
                  <details className="pos">
                    <summary>Position: {c.x}, {c.y}, {c.z}</summary>
                    <div className="cluster tight">
                      {(['x', 'y', 'z'] as Num[]).map((k) => (
                        <label key={k} className="cin">
                          <span className="label">{AXIS[k]}</span>
                          <MeasureInput unit="cm" min={0} step={0.5} value={c[k]} onChange={numC(c.id, k)} aria-label={`${c.name || 'Compartment'} ${AXIS_NAME[k]}`} required />
                        </label>
                      ))}
                    </div>
                  </details>
                  <details className="takes">
                    <summary>Auto-pack: {c.takes?.length ? <span className="takes-icons" aria-label={c.takes.map(titleCase).join(', ')}>{c.takes.map((cat) => <CatIcon key={cat} it={{ category: cat }} />)}</span> : 'anything'}</summary>
                    <div className="cluster tight">
                      {CATEGORIES.map((cat) => <button key={cat} type="button" className="chip ichip" aria-pressed={!!c.takes?.includes(cat)} onClick={() => toggleTakes(c, cat)}><CatIcon it={{ category: cat }} />{titleCase(cat)}</button>)}
                    </div>
                  </details>
                  </div>
                </div>
              ))}
            </div>
            <div className="cluster">
              <button type="button" className="btn text" onClick={addComp}><Icon name="plus" />Add compartment</button>
              <label className="heavy"><span className="label">Heavy items</span>
                <select value={form.heavy ?? ''} onChange={(e) => set('heavy', (e.target.value || undefined) as Bag['heavy'])} title="Where Auto-pack puts heavy items. An edge is the side against your back.">{HEAVY.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
              </label>
            </div>
          </Field>
        </FormCard>
      )}
      <div className="table" ref={listRef}>
        <div className="trow head sortable" style={COLS}>{by.head}</div>
        {list.map((b) => { const i = state.bags.indexOf(b); return (
          <button key={b.id} type="button" className={'trow bag' + (lift?.from === i ? ' lift' : '') + (lift && lift.to === i && lift.from !== i ? (lift.to > lift.from ? ' drop-after' : ' drop-before') : '')} style={COLS} aria-current={editing && form.id === b.id ? 'true' : undefined} onClick={() => ed.edit(b)} onKeyDown={(e) => !by.sorted && keyMove(e, i)} title={by.sorted ? undefined : 'Alt+↑/↓ reorders'}>
            <span className="name">{!by.sorted && <span className="grip" onPointerDown={(e) => grab(e, i)} aria-hidden="true"><Icon name="grip" /></span>}<span className="truncate">{b.name}</span>{b.compartments.length > 1 && <span className="tag">{b.compartments.length} compartments</span>}</span>
            <span className="num">{fmtDim(b.compartments[0])}</span>
            <span className="num">{fmtVol(bagVolume(b))}</span>
            <span className="num">{fmtW(b.empty)}</span>
            <span className="num">{b.limit == null ? '—' : fmtW(b.limit)}</span>
            <span className="num trips">{usedBy(b.id)}</span>
          </button>
        ) })}
        {!state.bags.length && <Blank art="bag" title="No bags yet">Add one from a preset, then correct the numbers.</Blank>}
        {state.bags.length > 1 && (by.sorted
          ? <p className="hint">Sorted by {by.sorted.toLowerCase()}. <button type="button" className="link" onClick={by.clear}>Show your order</button></p>
          : <p className="hint">Drag to reorder. New trips start with the first bag.</p>)}
      </div>
    </section>
  )
}
