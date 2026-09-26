import type { CSSProperties, PointerEvent as RPointerEvent } from 'react'
import { fmtDim, type Bag } from '../../store'
import { compBlock, eps, type Layout, type PackData, type PL } from './data'

/** Footprints placed in the last moment, with their order in the batch and, for an autopack batch, the offset each arrives from. */
export type Fresh = { ids: Record<string, number>; from: Record<string, [number, number]> }
export const NOT_FRESH: Fresh = { ids: {}, from: {} }

/** The plan drawing: each compartment at one scale on a 1 cm grid, soft fill hatched into the gaps, placed items as footprints, and the selected one dimensioned.
 *  `hidden` is a placement being dragged, drawn as the ghost instead; `pulse` is a home that just took a soft item. */
export function Sheet({ bag, layout, size, data, cut, selected, hidden, fresh, pulse, selPl, packedN, onClear, onItemDown }: {
  bag: Bag; layout: Layout; size: { W: number; H: number }; data: PackData; cut: number; selected: string | null; hidden?: string; fresh: Fresh
  pulse: { home: string; n: number } | null; selPl: PL | null; packedN: number; onClear: () => void; onItemDown: (e: RPointerEvent, pl: PL) => void
}) {
  const { placedList, looseBy, fills, cFills, cubeColor } = data
  const s = layout.s
  const compsByZ = [...layout.comps].sort((a, b) => a.c.z - b.c.z)
  return (
    <svg className="draw" width={size.W} height={size.H} role="img" aria-label={`${bag.name} in plan, ${packedN} items packed`}>
      <defs>
        <pattern id="g1" width={s} height={s} patternUnits="userSpaceOnUse" x={layout.comps[0].ox} y={layout.comps[0].oy}><path d={`M ${s} 0 H 0 V ${s}`} fill="none" stroke="var(--grid)" /></pattern>
        <pattern id="g10" width={s * 10} height={s * 10} patternUnits="userSpaceOnUse" x={layout.comps[0].ox} y={layout.comps[0].oy}>
          <rect width={s * 10} height={s * 10} fill="url(#g1)" />
          <path d={`M ${s * 10} 0 H 0 V ${s * 10}`} fill="none" stroke="var(--grid-major)" />
        </pattern>
        <pattern id="hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1={0} y1={0} x2={0} y2={6} stroke="var(--ink-2)" strokeWidth={0.75} /></pattern>
        <pattern id="hatch-red" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1={0} y1={0} x2={0} y2={6} stroke="var(--red)" strokeWidth={0.9} /></pattern>
      </defs>
      <rect width={size.W} height={size.H} fill="url(#g10)" onPointerDown={onClear} />
      {compsByZ.map(({ c, ox, oy }) => {
        const cutLocal = cut - c.z
        const inComp = placedList.filter((pl) => pl.p.compartmentId === c.id && pl.p.id !== hidden).sort((a, b) => Number(a.p.id === selected) - Number(b.p.id === selected) || a.box.z - b.box.z)
        const f = fills[c.id]
        const selC = selected === c.id
        const floor = `color-mix(in srgb, ${compBlock(c, bag.compartments.indexOf(c))} var(--floor), var(--paper))`
        return (
          <g key={c.id} className="comp">
            <rect className="frame" x={ox} y={oy} width={c.l * s} height={c.w * s} fill={floor} stroke={selC ? 'var(--blue)' : 'var(--ink)'} strokeWidth={2} onPointerDown={onClear} />
            <text className="cname" x={ox} y={oy - 12}>{c.name}<tspan className="cdim" dx={8}>{fmtDim(c)} cm</tspan></text>
            {(looseBy[c.id] ?? 0) > 0 && (
              <>
                <mask id={`m-${c.id}`}>
                  <rect x={ox} y={oy} width={c.l * s} height={c.w * s} fill="#fff" />
                  {inComp.filter((pl) => pl.box.z < cutLocal - eps).map((pl) => <rect key={pl.p.id} x={ox + pl.box.x * s} y={oy + pl.box.y * s} width={pl.box.l * s} height={pl.box.w * s} fill="#000" />)}
                </mask>
                <rect x={ox} y={oy} width={c.l * s} height={c.w * s} fill={`url(#${f.over ? 'hatch-red' : 'hatch'})`} mask={`url(#m-${c.id})`} opacity={0.3 + 0.5 * Math.min(1, f.ratio)} pointerEvents="none" />
              </>
            )}
            <g>
              {inComp.map((pl) => (
                <ItemRect key={pl.p.id} pl={pl} s={s} ox={ox} oy={oy} above={pl.box.z >= cutLocal - eps} selected={pl.p.id === selected} delay={fresh.ids[pl.p.id]} from={fresh.from[pl.p.id]} holds={cFills[pl.p.id]} block={cubeColor[pl.p.id]} onDown={(e) => onItemDown(e, pl)} />
              ))}
            </g>
          </g>
        )
      })}
      {pulse && (() => {
        const cube = placedList.find((pl) => pl.p.id === pulse.home), cl = layout.comps.find((x) => x.c.id === (cube ? cube.p.compartmentId : pulse.home))
        if (!cl) return null
        const r = cube ? { x: cl.ox + cube.box.x * s, y: cl.oy + cube.box.y * s, w: cube.box.l * s, h: cube.box.w * s } : { x: cl.ox, y: cl.oy, w: cl.c.l * s, h: cl.c.w * s }
        return <rect key={pulse.n} className="absorb" x={r.x} y={r.y} width={r.w} height={r.h} pointerEvents="none" />
      })()}
      {selPl && layout.comps.find((cl) => cl.c.id === selPl.p.compartmentId) && (() => {
        const { ox, oy } = layout.comps.find((cl) => cl.c.id === selPl.p.compartmentId)!
        return (
          <>
            <Dim x1={ox + selPl.box.x * s} y1={oy + (selPl.box.y + selPl.box.w) * s + 22} x2={ox + (selPl.box.x + selPl.box.l) * s} y2={oy + (selPl.box.y + selPl.box.w) * s + 22} edge={oy + (selPl.box.y + selPl.box.w) * s} label={`${selPl.box.l}`} color="var(--blue)" />
            <Dim x1={ox + selPl.box.x * s - 22} y1={oy + selPl.box.y * s} x2={ox + selPl.box.x * s - 22} y2={oy + (selPl.box.y + selPl.box.w) * s} edge={ox + selPl.box.x * s} label={`${selPl.box.w}`} color="var(--blue)" />
          </>
        )
      })()}
    </svg>
  )
}

type Holds = { n: number; ratio: number; over: boolean }
/** Greedy word wrap into at most max lines; the first line may be shorter (room for marks). An overflowing last line ends in an ellipsis. */
function wrapLabel(text: string, first: number, per: number, max: number) {
  const out: string[] = []
  let line = ''
  const cap = () => (out.length ? per : first)
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (next.length <= cap()) { line = next; continue }
    if (line) out.push(line)
    line = word
  }
  if (line) out.push(line)
  const kept = out.slice(0, max).map((l, i) => (l.length > (i ? per : first) ? l.slice(0, Math.max(1, (i ? per : first) - 1)) + '…' : l))
  if (out.length > max) { const last = kept[max - 1]; const room = (max > 1 ? per : first) - 1; kept[max - 1] = (last.length > room ? last.slice(0, Math.max(1, room)) : last) + '…' }
  return kept
}

function ItemRect({ pl, s, ox, oy, above, selected, delay, from, holds, block, onDown }: { pl: PL; s: number; ox: number; oy: number; above: boolean; selected: boolean; delay?: number; from?: [number, number]; holds?: Holds; block?: string; onDown: (e: RPointerEvent) => void }) {
  const w = pl.box.l * s, h = pl.box.w * s
  const stroke = selected ? 'var(--blue)' : above ? 'var(--ink-3)' : 'var(--ink)'
  const tint = above ? null : block ? `color-mix(in srgb, ${block} var(--bmix), var(--paper))` : pl.it.color ? `color-mix(in srgb, ${pl.it.color} var(--tint), var(--paper))` : null
  // Names wrap by word onto as many lines as the footprint holds; only the last line that fits takes an ellipsis.
  const per = Math.floor((w - 12) / 6.8), lines = wrapLabel(pl.it.name, per - (pl.it.up ? 3 : 0), per, Math.max(1, Math.floor((h - 6) / 15) - (holds && h > 36 ? 1 : 0)))
  return (
    <g className={'it' + (delay == null ? '' : from ? ' arrive' : ' settle')} style={{ transform: `translate(${ox + pl.box.x * s}px, ${oy + pl.box.y * s}px)`, '--d': `${delay ?? 0}ms` } as CSSProperties}>
      <g className="body" style={from && ({ '--from': `translate(${from[0]}px, ${from[1]}px)` } as CSSProperties)}>
      <rect width={w} height={h} fill={above ? 'none' : 'var(--raise)'} stroke={stroke} strokeWidth={selected ? 2 : 1} strokeDasharray={above ? '4 3' : undefined} onPointerDown={onDown}><title>{pl.it.name}</title></rect>
      {tint && <rect className="ink" x={0.5} y={0.5} width={Math.max(0, w - 1)} height={Math.max(0, h - 1)} fill={tint} pointerEvents="none" />}
      {holds && holds.n > 0 && !above && <rect x={3} y={3} width={Math.max(0, w - 6)} height={Math.max(0, h - 6)} fill={`url(#${holds.over ? 'hatch-red' : 'hatch'})`} opacity={0.35 + 0.65 * Math.min(1, holds.ratio)} pointerEvents="none" />}
      {w > 40 && h > 18 && <text x={6} y={16} fontSize={13} fontWeight={500} fill={above ? 'var(--ink-2)' : 'var(--ink)'}>{lines.map((l, i) => <tspan key={i} x={6} dy={i ? 15 : 0}>{l}</tspan>)}</text>}
      {holds && w > 70 && h > 36 && <text x={6} y={16 + lines.length * 15 + 1} fontSize={12} fill={holds.over ? 'var(--red)' : 'var(--ink-2)'}>{holds.n ? `${Math.round(holds.ratio * 100)} %` : 'empty'}</text>}
      {pl.it.up && w > 56 && h > 18 && <path d={`M ${w - 16} 13 v-8 m-3 3 l3-3 3 3 M ${w - 8} 13 v-8 m-3 3 l3-3 3 3`} fill="none" stroke={above ? 'var(--ink-3)' : 'var(--ink-2)'} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" aria-label="This side up" />}
      </g>
    </g>
  )
}

/** A postmark with no words: double ring and wavy cancellation bars. The trip is ready to travel. */
export function Postmark() {
  const wave = (y: number) => `M 62 ${y} c 8 -5 16 -5 24 0 s 16 5 24 0 s 16 -5 24 0 s 16 5 24 0`
  return (
    <svg className="stamp" width={168} height={64} viewBox="0 0 168 64" role="status" aria-label="Ready to travel: checklist packed, every bag under its limit">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <circle cx={30} cy={32} r={26} strokeWidth={2} />
        <circle cx={30} cy={32} r={21} strokeWidth={1} />
        {[16, 24, 32, 40, 48].map((y) => <path key={y} d={wave(y)} strokeWidth={1.5} />)}
      </g>
    </svg>
  )
}

/** Architect's dimension string: hairline, 45° ticks, extension lines from the measured edge. */
function Dim({ x1, y1, x2, y2, edge, label, color = 'var(--ink)' }: { x1: number; y1: number; x2: number; y2: number; edge: number; label: string; color?: string }) {
  const t = 4
  const vertical = x1 === x2
  const textStyle = { fontStretch: '80%', letterSpacing: '0.04em' } as const
  if (vertical) {
    const ex = x1 + (x1 > edge ? 6 : -6)
    const my = (y1 + y2) / 2
    return (
      <g stroke={color} fill="none" strokeWidth={0.75}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        <line x1={edge} y1={y1} x2={ex} y2={y1} strokeWidth={0.5} />
        <line x1={edge} y1={y2} x2={ex} y2={y2} strokeWidth={0.5} />
        <line x1={x1 - t} y1={y1 + t} x2={x1 + t} y2={y1 - t} />
        <line x1={x1 - t} y1={y2 + t} x2={x1 + t} y2={y2 - t} />
        <text x={x1 - 5} y={my} fontSize={11} fill={color} stroke="none" textAnchor="middle" transform={`rotate(-90 ${x1 - 5} ${my})`} style={textStyle}>{label}</text>
      </g>
    )
  }
  const ey = y1 + (y1 < edge ? -6 : 6)
  return (
    <g stroke={color} fill="none" strokeWidth={0.75}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line x1={x1} y1={edge} x2={x1} y2={ey} strokeWidth={0.5} />
      <line x1={x2} y1={edge} x2={x2} y2={ey} strokeWidth={0.5} />
      <line x1={x1 - t} y1={y1 + t} x2={x1 + t} y2={y1 - t} />
      <line x1={x2 - t} y1={y1 + t} x2={x2 + t} y2={y1 - t} />
      <text x={(x1 + x2) / 2} y={y1 < edge ? y1 - 5 : y1 + 13} fontSize={11} fill={color} stroke="none" textAnchor="middle" style={textStyle}>{label}</text>
    </g>
  )
}
