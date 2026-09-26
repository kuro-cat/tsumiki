import type { ReactNode } from 'react'

/** Small line drawings for empty states, in the same stroke as the icons, a size up. */
const ART = {
  bag: <><rect x="12" y="18" width="32" height="30" /><path d="M21 18v-4a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4M12 30h32M24 30v5h8v-5" /></>,
  list: <><rect x="14" y="10" width="28" height="38" /><path d="M22 10v-2h12v2M20 22h4M28 22h8M20 30h4M28 30h8M20 38h4M28 38h5" /></>,
  worn: <><path d="M20 12l-8 6 4 7 4-2v21h16V23l4 2 4-7-8-6c-1 3-4 5-8 5s-7-2-8-5z" /></>,
  cube: <><path d="M28 10l16 8v20l-16 8-16-8V18z" /><path d="M12 18l16 8 16-8M28 26v20" /></>,
} as const

export function Blank({ art, title, children }: { art: keyof typeof ART; title: string; children?: ReactNode }) {
  return (
    <div className="blank">
      <svg width={56} height={56} viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ART[art]}</svg>
      <p className="blank-title">{title}</p>
      {children && <div className="blank-body">{children}</div>}
    </div>
  )
}
