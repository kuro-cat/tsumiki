/** Per-browser preferences, kept out of State so exports stay about packing. Without storage they last the session. */

export type Theme = 'system' | 'light' | 'dark'
/** index.html reads this key too, to apply the theme before first paint. */
const THEME_KEY = 'bin-pack.theme'
/** Earlier versions stored the paper names. */
const OLD_THEMES: Record<string, Theme> = { vellum: 'light', blueprint: 'dark' }
export const readTheme = (): Theme => { try { const t = localStorage.getItem(THEME_KEY) ?? 'system'; return OLD_THEMES[t] ?? (t as Theme) } catch { return 'system' } }
export const writeTheme = (t: Theme) => { try { localStorage.setItem(THEME_KEY, t) } catch { /* session-only */ } }

const ANIM_KEY = 'bin-pack.autopack-anim'
/** Whether an Auto-pack batch arrives one item at a time. On unless switched off on the Data page. */
export const autopackAnimates = () => { try { return localStorage.getItem(ANIM_KEY) !== 'off' } catch { return true } }
export const setAutopackAnimates = (on: boolean) => { try { localStorage.setItem(ANIM_KEY, on ? 'on' : 'off') } catch { /* session-only */ } }
