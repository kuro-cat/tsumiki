const P = {
  grip: 'M6 4.5v.01M10 4.5v.01M6 8v.01M10 8v.01M6 11.5v.01M10 11.5v.01',
  rotate: 'M3.5 8a4.5 4.5 0 1 0 1.3-3.2M3.5 3.5V6h2.5',
  x: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  plus: 'M8 3.5v9M3.5 8h9',
  minus: 'M3.5 8h9',
  tip: 'M4 12.5h8M8 3v7M5.5 5.5L8 3l2.5 2.5',
  check: 'M3.5 8.5l2.8 2.8 6.2-6.6',
  arrow: 'M3 8h10M9.5 4.5L13 8l-3.5 3.5',
  spark: 'M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3M4.5 4.5l1.5 1.5M10 10l1.5 1.5M11.5 4.5L10 6M6 10l-1.5 1.5',
} as const

export function Icon({ name, size = 16 }: { name: keyof typeof P; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  )
}
