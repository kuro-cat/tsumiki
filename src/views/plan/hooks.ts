import { useEffect, useRef, useState } from 'react'

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
