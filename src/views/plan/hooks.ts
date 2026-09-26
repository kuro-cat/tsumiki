import { useEffect, useRef, useState, type RefObject } from 'react'

/** A value that falls back to `rest` a while after it is shown. show(v, ms) sets it and restarts the countdown. */
export function useTransient<T>(rest: T) {
  const [value, setValue] = useState(rest)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const show = (next: T, ms: number) => {
    setValue(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setValue(rest), ms)
  }
  return [value, show] as const
}

/** The element's inner size, kept current. `ready` re-attaches once the element exists. */
export function useSheetSize(ref: RefObject<HTMLElement | null>, ready: boolean) {
  const [size, setSize] = useState({ W: 0, H: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, ready])
  return size
}

export const FILL_MS = 420
/** A number that eases to each new value, so a readout counts up rather than jumping. Reduced motion jumps. */
export function useTween(value: number, ms: number) {
  const [v, setV] = useState(value)
  const at = useRef(value), raf = useRef(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { at.current = value; setV(value); return }
    const a = at.current, t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms), x = a + (value - a) * (1 - Math.pow(1 - k, 3))
      at.current = x; setV(x)
      if (k < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [value, ms])
  return v
}
