import Anthropic from '@anthropic-ai/sdk'
import { CATEGORIES, type AiSettings, type Category, type CheckItem } from './model.ts'

export type AiTrip = { name: string; destination: string; start: string; end: string; climate: string; kind: string; activities: string[] }
export type Extra = Omit<CheckItem, 'id' | 'packed'>

const SYSTEM =
  'You suggest packing-list additions for one traveler. Reply with only a JSON array and no prose. ' +
  `Each element: {"label": string, "category": one of ${JSON.stringify(CATEGORIES)}, "qty": integer, "note": string under 12 words}. ` +
  'Suggest at most 10 items specific to the destination, season, and activities that are not already listed. Skip anything generic.'
const MAX_TOKENS = 4000
const ANTHROPIC_MODEL = 'claude-opus-5-5'

/** Missing settings, in words for the traveler, or null when the provider is ready to ask. */
export function aiSetupGap(ai: AiSettings): string | null {
  if (!ai.key) return 'Add an API key under Data first.'
  if (ai.provider === 'openai' && !ai.baseUrl) return 'Add the base URL under Data first.'
  if (ai.provider === 'openai' && !ai.model) return 'Add the model under Data first.'
  return null
}

/** Destination-specific extras from the chosen provider. The key stays in the browser; the request goes straight to the provider,
 *  or through the local dev server's /ai-proxy for OpenAI-compatible endpoints that block browser calls. */
export async function aiExtras(ai: AiSettings, trip: AiTrip, alreadyListed: string[]): Promise<Extra[]> {
  const user = JSON.stringify({ trip, alreadyListed })
  return parseExtras(ai.provider === 'openai' ? await askOpenAi(ai, user) : await askAnthropic(ai, user))
}

async function askAnthropic(ai: AiSettings, user: string) {
  const client = new Anthropic({ apiKey: ai.key, dangerouslyAllowBrowser: true })
  const res = await client.beta.messages.create({
    model: ai.model || ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
  })
  if (res.stop_reason === 'refusal') throw new Error('The model declined this request.')
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1']

async function askOpenAi(ai: AiSettings, user: string) {
  const url = `${ai.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const res = await fetch(LOCAL_HOSTS.includes(location.hostname) ? `/ai-proxy/${url}` : url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.key}` },
    body: JSON.stringify({ model: ai.model, max_tokens: MAX_TOKENS, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }),
  })
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } | string; choices?: { message?: { content?: string } }[] } | null
  if (!res.ok) {
    const error = typeof body?.error === 'string' ? body.error : body?.error?.message
    throw new Error(error || `Request failed: ${res.status} ${res.statusText}`.trim())
  }
  return body?.choices?.[0]?.message?.content ?? ''
}

/** The JSON array in a model's reply, loosely read: prose or a code fence around it is fine, unknown categories become misc. */
export function parseExtras(text: string): Extra[] {
  const s = text.indexOf('['), e = text.lastIndexOf(']')
  if (s < 0 || e < s) throw new Error('The model did not return a list.')
  const arr = JSON.parse(text.slice(s, e + 1)) as { label?: unknown; category?: unknown; qty?: unknown; note?: unknown }[]
  return arr
    .map((a) => ({ ...a, label: typeof a.label === 'string' ? a.label.trim() : '' }))
    .filter((a) => a.label)
    .map((a) => ({
      label: a.label,
      category: CATEGORIES.includes(a.category as Category) ? (a.category as Category) : 'misc',
      qty: Math.max(1, Math.round(Number(a.qty) || 1)),
      match: [a.label.toLowerCase()],
      source: 'ai' as const,
      note: typeof a.note === 'string' ? a.note : undefined,
    }))
}
