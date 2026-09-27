/** Display units. Everything is stored metric (cm, g); imperial only changes what is shown and typed. Volume stays in litres either way. */
export type Units = 'metric' | 'imperial'

// The app sets this from prefs before rendering; formatters read it unless given units, which the tests do.
let current: Units = 'metric'
export const setUnits = (u: Units) => { current = u }

/** Each metric input unit's imperial stand-in: how many of the metric unit make one, and the decimals shown. */
const IMPERIAL: Record<string, { unit: string; per: number; dp: number }> = {
  cm: { unit: 'in', per: 2.54, dp: 1 },
  kg: { unit: 'lb', per: 0.45359237, dp: 2 },
  g: { unit: 'oz', per: 28.349523125, dp: 1 },
}
const G_PER_LB = 453.59237
const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp

/** Whether an input in this metric unit shows something else. */
export const converts = (unit: string, u = current) => u === 'imperial' && unit in IMPERIAL
export const shownUnit = (unit: string, u = current) => (converts(unit, u) ? IMPERIAL[unit].unit : unit)
/** A metric value as shown, rounded to the shown decimals. */
export const toShown = (v: number, unit: string, u = current) => (converts(unit, u) ? round(v / IMPERIAL[unit].per, IMPERIAL[unit].dp) : v)
/** A shown value back to metric, to 0.001 so a value typed in imperial reads back the same. */
export const fromShown = (v: number, unit: string, u = current) => (converts(unit, u) ? round(v * IMPERIAL[unit].per, 3) : v)
/** The smallest step the shown decimals allow. */
export const shownStep = (unit: string, u = current) => (converts(unit, u) ? 10 ** -IMPERIAL[unit].dp : undefined)
/** A metric minimum as shown, rounded up so the shown value never falls below it. */
export const shownMin = (v: number, unit: string, u = current) => {
  if (!converts(unit, u)) return v
  const { per, dp } = IMPERIAL[unit]
  return Math.ceil(round((v / per) * 10 ** dp, 6)) / 10 ** dp
}

export const lenUnit = (u = current) => shownUnit('cm', u)
/** A length in cm as shown, without its unit. */
export const len = (cm: number, u = current) => String(u === 'imperial' ? toShown(cm, 'cm', u) : round(cm, 1))
export const fmtDim = (b: { l: number; w: number; h: number }, u = current) => `${len(b.l, u)} × ${len(b.w, u)} × ${len(b.h, u)}`
/** Grams as g or kg, or in imperial as oz under a pound and lb from there. */
export const fmtW = (g: number, u = current) =>
  u === 'imperial'
    ? Math.abs(g) >= G_PER_LB ? (g / G_PER_LB).toFixed(2) + ' lb' : (g / IMPERIAL.g.per).toFixed(1) + ' oz'
    : Math.abs(g) >= 1000 ? (g / 1000).toFixed(2) + ' kg' : Math.round(g) + ' g'
