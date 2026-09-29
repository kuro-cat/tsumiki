import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { balance } from '../../lib/columns'
import { CAT } from '../../Icon'
import { bagTotals, CATEGORIES, fmtW, linkedItems, nights, packedCount, titleCase, tripBags, tripReady, wornCount, type Bag, type Category, type Item, type Trip } from '../../store'

/** Fjord sea for the list, Night sea's text, accent and red on the ink band. Fixed, so a shared card looks the same whatever theme it was made in. */
const C = { ink: '#152022', paper: '#f2f5f5', raise: '#fbfcfc', ink2: '#475759', ink3: '#5d6d6f', rule: '#cbd5d7', on: '#f2f5f5', on2: '#a3b3b4', seam: '#2c4043', blue: '#6fb3c4', red: '#e07a6e', track: 'rgb(255 255 255 / 0.12)' }
const W = 720, X = 40, CW = W - 2 * X, GAP = 6, COLS = 3, COL = (CW - GAP * (COLS - 1)) / COLS, PAD = 14, HEAD = 32
const S = 2 // raster scale
const LINE = 19.6, ROW = 6 + LINE // list rows: 14px at 1.4, 3px above and below
type G = CanvasRenderingContext2D
type Font = { size: number; weight?: number; caps?: boolean; mark?: boolean; track?: number }
type Run = [string, Font, string]

const F = {
  title: { size: 52, weight: 700, track: -0.035 }, sub: { size: 15 }, caps: { size: 12, weight: 600, caps: true }, fact: { size: 15, weight: 600 }, factMute: { size: 15 },
  bag: { size: 14, weight: 600 }, stat: { size: 14 }, statB: { size: 14, weight: 600 }, row: { size: 15, weight: 500 }, qty: { size: 14, weight: 500 }, tag: { size: 11, weight: 600, caps: true }, note: { size: 12 }, foot: { size: 13 }, mark: { size: 14, weight: 700, mark: true },
} satisfies Record<string, Font>

function font(g: G, f: Font) {
  g.font = `${f.weight ?? 400} ${f.size}px Archivo, system-ui, sans-serif`
  g.fontStretch = f.mark ? 'ultra-condensed' : f.caps ? 'extra-condensed' : 'normal'
  g.letterSpacing = `${(f.mark ? 0.22 : f.caps ? 0.08 : f.track ?? 0) * f.size}px`
}
const shown = (s: string, f: Font) => (f.caps || f.mark ? s.toUpperCase() : s)
function measure(g: G, s: string, f: Font) { font(g, f); return g.measureText(shown(s, f)).width }
function text(g: G, s: string, x: number, y: number, f: Font, color: string, align: CanvasTextAlign = 'left') {
  font(g, f); g.fillStyle = color; g.textAlign = align
  g.fillText(shown(s, f), x, y)
  return g.measureText(shown(s, f)).width
}
/** Runs of text set one after another on a line, each in its own weight and colour; `right` sets the line flush right at x. */
function runs(g: G, x: number, y: number, parts: Run[], right = false) {
  if (right) x -= parts.reduce((a, [s, f]) => a + measure(g, s, f), 0)
  for (const [s, f, c] of parts) x += text(g, s, x, y, f, c)
}
/** Greedy word wrap to a width; a word wider than the line is cut with an ellipsis. */
function wrap(g: G, s: string, width: number, f: Font) {
  font(g, f)
  const fit = (w: string) => { if (g.measureText(w).width <= width) return w; while (w.length > 1 && g.measureText(w + '…').width > width) w = w.slice(0, -1); return w + '…' }
  const out: string[] = []
  let line = ''
  for (const word of s.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (g.measureText(next).width <= width) line = next
    else { if (line) out.push(line); line = fit(word) }
  }
  if (line) out.push(line)
  return out
}
/** The wordless postmark from the plan: double ring and wavy cancellation bars. */
function postmark(g: G, x: number, y: number) {
  g.save(); g.translate(x, y); g.rotate(-6 * Math.PI / 180); g.strokeStyle = C.blue; g.lineCap = 'round'
  const ring = (r: number, lw: number) => { g.lineWidth = lw; g.beginPath(); g.arc(30, 32, r, 0, Math.PI * 2); g.stroke() }
  ring(26, 2); ring(21, 1)
  g.lineWidth = 1.5
  for (const wy of [16, 24, 32, 40, 48]) g.stroke(new Path2D(`M 62 ${wy} c 8 -5 16 -5 24 0 s 16 5 24 0 s 16 -5 24 0 s 16 5 24 0`))
  g.restore()
}

type Row = { qty: number; name: string; weight?: number; worn: number; icon: string }
/** Everything packed on the trip, worn included, by category in the app's order; checklist entries ticked by hand come in without a weight. */
function packingList(trip: Trip, items: Item[]) {
  const by = new Map<Category, Row[]>()
  const add = (c: Category, r: Row) => by.set(c, [...(by.get(c) ?? []), r])
  for (const it of items) {
    const n = packedCount(trip, it.id)
    if (n) add(it.category, { qty: n, name: it.name, weight: it.weight * n, worn: wornCount(trip, it.id), icon: tint(it.category, it.color) })
  }
  for (const c of trip.checklist) if (c.packed && !linkedItems(c, items).length) add(c.category, { qty: c.qty, name: c.label, worn: 0, icon: tint(c.category) })
  return CATEGORIES.filter((c) => by.has(c)).map((cat) => ({ cat, rows: by.get(cat)!.sort((a, b) => a.name.localeCompare(b.name)) }))
}

/** A row's pictogram key: its category in the item's colour, mixed 72 % into ink as in the schedule, or muted ink when it has none. */
function tint(cat: Category, color?: string) {
  if (!color) return `${cat}|${C.ink2}`
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [a, b] = [hex(color), hex(C.ink)]
  return `${cat}|#${a.map((v, i) => Math.round(v * 0.72 + b[i] * 0.28).toString(16).padStart(2, '0')).join('')}`
}
/** The pictograms the list needs, drawn from the same icons the schedule uses. */
async function pictograms(keys: string[]) {
  keys = [...new Set(keys)]
  const host = document.createElement('div'), root = createRoot(host)
  flushSync(() => root.render(<>{keys.map((k) => { const [c, color] = k.split('|'), I = CAT[c as Category]; return <I key={k} size={16} strokeWidth={2} color={color} /> })}</>))
  const svgs = [...host.querySelectorAll('svg')].map((s) => s.outerHTML)
  root.unmount()
  return Object.fromEntries(await Promise.all(svgs.map(async (s, i) => {
    const img = new Image()
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s)
    await img.decode()
    return [keys[i], img] as const
  })))
}

/** Paints the card and returns its height and the ink band's. Run once to measure, then again at that size to draw. */
function paint(g: G, trip: Trip, bags: Bag[], items: Item[], icons: Record<string, HTMLImageElement>, H: number, inkH: number) {
  g.fillStyle = C.paper; g.fillRect(0, 0, W, H)
  g.fillStyle = C.ink; g.fillRect(0, 0, W, inkH)

  // Ink band: the trip's name is the one large thing; the facts and each bag's totals sit small beneath it.
  let y = 48 + 44
  text(g, trip.name, X, y, F.title, C.on)
  if (tripReady(trip, bags, items)) postmark(g, W - X - 160, 44)
  if (trip.destination && trip.destination !== trip.name) { y += 32; text(g, trip.destination, X, y, F.sub, C.on2) }
  y += 36
  g.fillStyle = C.seam; g.fillRect(X, y, CW, 1)
  y += 26
  const n = nights(trip), worn = trip.worn.length
  const units = trip.placements.length + trip.loose.length + worn
  const dates = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(new Date(trip.start + 'T00:00'), new Date(trip.end + 'T00:00'))
  const facts: [string, Run[]][] = [
    ['Dates', [[dates, F.fact, C.on]]],
    ['Nights', [[String(n), F.fact, C.on]]],
    ['Items', [[String(units), F.fact, C.on], ...(worn ? [[` · ${worn} worn`, F.factMute, C.on2] as Run] : [])]],
  ]
  let fx = X
  for (const [label, value] of facts) {
    text(g, label, fx, y, F.caps, C.on2)
    runs(g, fx, y + 22, value)
    fx += Math.max(measure(g, label, F.caps), value.reduce((a, [s, f]) => a + measure(g, s, f), 0)) + 32
  }
  y += 22 + 44
  for (const bag of bags) {
    const t = bagTotals(bag, trip, items)
    const heavy = t.margin != null && t.margin < 0
    text(g, bag.name, X, y, F.bag, C.on)
    runs(g, X + CW, y, [
      [fmtW(t.total), F.statB, heavy ? C.red : C.on], ...(t.limit == null ? [] : [[` of ${fmtW(t.limit)}`, F.stat, C.on2] as Run]),
      [' · ', F.stat, C.on2], [`${Math.round(t.fill * 100)} %`, F.statB, t.over ? C.red : C.on], [' full', F.stat, C.on2],
    ], true)
    g.fillStyle = C.track; g.fillRect(X, y + 11, CW, 3)
    g.fillStyle = t.over ? C.red : C.blue; g.fillRect(X, y + 11, CW * Math.min(1, t.fill), 3)
    y += 37
  }
  const inkEnd = y + 8

  // The list: each category a block, kept whole, the blocks stacked into columns as evenly as they go.
  y = inkEnd + 40
  const list = packingList(trip, items)
  const inner = COL - 2 * PAD
  const blocks = list.map(({ cat, rows }) => {
    const laid = rows.map((r) => {
      // A quantity over one sits muted at the right as ×3; a worn unit is tagged beside it.
      const q = r.qty > 1 ? `×${r.qty}` : ''
      const qw = q ? measure(g, q, F.qty) : 0
      const ww = r.worn ? measure(g, 'Worn', F.tag) + 8 : 0
      const lines = wrap(g, r.name, inner - 24 - qw - ww - (qw || ww ? 6 : 0), F.row)
      return { r, q, qw, lines, h: ROW + LINE * (lines.length - 1) }
    })
    const total = rows.reduce((a, r) => a + (r.weight ?? 0), 0)
    return { cat, laid, total, h: HEAD + 8 + laid.reduce((a, l) => a + l.h, 0) + 10 }
  })
  let bottom = y
  balance(blocks.map((b) => b.h + GAP), COLS).forEach((col, ci) => {
    const x = X + ci * (COL + GAP)
    let cy = y
    for (const bi of col) {
      const { cat, laid, total, h } = blocks[bi]
      g.fillStyle = C.rule; g.fillRect(x, cy, COL, h)
      g.fillStyle = C.raise; g.fillRect(x + 1, cy + 1, COL - 2, h - 2)
      // The heading is inverted, an ink strip across the block like the band above.
      g.fillStyle = C.ink; g.fillRect(x, cy, COL, HEAD)
      text(g, titleCase(cat), x + PAD, cy + 21, F.caps, C.on)
      if (total) text(g, fmtW(total), x + COL - PAD, cy + 21, F.note, C.on2, 'right')
      let ry = cy + HEAD + 8
      for (const l of laid) {
        const base = ry + 3 + 15
        if (icons[l.r.icon]) g.drawImage(icons[l.r.icon], x + PAD, base - 13, 16, 16)
        l.lines.forEach((s, i) => text(g, s, x + PAD + 24, base + i * LINE, F.row, C.ink))
        let rx = x + COL - PAD
        if (l.q) { text(g, l.q, rx, base, F.qty, C.ink2, 'right'); rx -= l.qw + 8 }
        if (l.r.worn) text(g, 'Worn', rx, base, F.tag, C.ink2, 'right')
        ry += l.h
      }
      cy += h + GAP
    }
    bottom = Math.max(bottom, cy)
  })
  if (!list.length) { text(g, 'Nothing packed yet', X, y + 14, F.row, C.ink2); bottom = y + 32 }

  // Signed off at the foot.
  y = bottom + 28
  g.fillStyle = C.ink; g.fillRect(X, y, CW, 1)
  y += 29
  const pw = text(g, 'Planned using', X, y, F.foot, C.ink2)
  text(g, 'Tsumiki', X + pw + 6, y, F.mark, C.ink)
  text(g, "Packing shouldn't be NP-hard.", X + CW, y, F.foot, C.ink2, 'right')
  return { H: y + 30, inkH: inkEnd }
}

/** The trip as a PNG card: an ink band with the trip and each bag's totals, the packing list by category, and the TSUMIKI line. */
async function tripPng(trip: Trip, bags: Bag[], items: Item[]) {
  await Promise.all(['700 52px Archivo', 'condensed 600 12px Archivo'].map((f) => document.fonts.load(f)))
  const icons = await pictograms(packingList(trip, items).flatMap((b) => b.rows.map((r) => r.icon)))
  const canvas = document.createElement('canvas')
  const { H, inkH } = paint(canvas.getContext('2d')!, trip, bags, items, icons, 0, 0)
  canvas.width = W * S; canvas.height = H * S
  const g = canvas.getContext('2d')!
  g.scale(S, S)
  paint(g, trip, bags, items, icons, H, inkH)
  return new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error('No image'))), 'image/png'))
}

/** Opens the share sheet with the card where the browser has one, else downloads it. */
export async function shareTrip(trip: Trip, allBags: Bag[], items: Item[]) {
  const name = trip.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'trip'
  const file = new File([await tripPng(trip, tripBags(trip, allBags), items)], `${name}.png`, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }) } catch (e) { if ((e as Error).name !== 'AbortError') throw e }
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
