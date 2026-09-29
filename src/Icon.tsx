import type { CSSProperties } from 'react'
import { Compass, Droplets, Footprints, IdCard, Package, Plug, Shirt, type LucideIcon } from 'lucide-react'
import type { Category } from './store'

const P = {
  grip: 'M6 4.5v.01M10 4.5v.01M6 8v.01M10 8v.01M6 11.5v.01M10 11.5v.01',
  rotate: 'M3.5 8a4.5 4.5 0 1 0 1.3-3.2M3.5 3.5V6h2.5',
  x: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  plus: 'M8 3.5v9M3.5 8h9',
  minus: 'M3.5 8h9',
  tip: 'M4 12.5h8M8 3v7M5.5 5.5L8 3l2.5 2.5',
  check: 'M3.5 8.5l2.8 2.8 6.2-6.6',
  arrow: 'M3 8h10M9.5 4.5L13 8l-3.5 3.5',
  up: 'M8 12.5v-9M4.5 7L8 3.5 11.5 7',
  down: 'M8 3.5v9M4.5 9L8 12.5 11.5 9',
  chev: 'M4.5 6.5L8 10l3.5-3.5',
  spark: 'M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3M4.5 4.5l1.5 1.5M10 10l1.5 1.5M11.5 4.5L10 6M6 10l-1.5 1.5',
} as const

export function Icon({ name, size = 16 }: { name: keyof typeof P; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  )
}

export const CAT: Record<Category, LucideIcon> = { clothing: Shirt, footwear: Footprints, toiletries: Droplets, electronics: Plug, documents: IdCard, gear: Compass, misc: Package }

/** An item's category, drawn in its own colour when it has one. */
export function CatIcon({ it }: { it: { category: Category; color?: string } }) {
  const C = CAT[it.category]
  return <C className={'cat' + (it.color ? ' tinted' : '')} size={18} strokeWidth={2} style={it.color ? ({ '--sw': it.color } as CSSProperties) : undefined} aria-hidden="true" />
}
