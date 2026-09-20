import Anthropic from '@anthropic-ai/sdk'
import { CATEGORIES, type Category, type CheckItem } from '../store'

export type AiTrip = { name: string; destination: string; start: string; end: string; climate: string; kind: string; activities: string[] }

/** Destination-specific extras from Claude. Key stays in the browser; the request goes straight to Anthropic. */
export async function aiExtras(apiKey: string, trip: AiTrip, alreadyListed: string[]): Promise<Omit<CheckItem, 'id' | 'packed'>[]> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const res = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system:
      'You suggest packing-list additions for one traveler. Reply with only a JSON array and no prose. ' +
      `Each element: {"label": string, "category": one of ${JSON.stringify(CATEGORIES)}, "qty": integer, "note": string under 12 words}. ` +
      'Suggest at most 10 items specific to the destination, season, and activities that are not already listed. Skip anything generic.',
    messages: [{ role: 'user', content: JSON.stringify({ trip, alreadyListed }) }],
  })
  if (res.stop_reason === 'refusal') throw new Error('Claude declined this request.')
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  const s = text.indexOf('['), e = text.lastIndexOf(']')
  if (s < 0 || e < s) throw new Error('Claude did not return a list.')
  const arr = JSON.parse(text.slice(s, e + 1)) as { label?: unknown; category?: unknown; qty?: unknown; note?: unknown }[]
  return arr
    .filter((a) => typeof a.label === 'string' && (a.label as string).trim())
    .map((a) => ({
      label: (a.label as string).trim(),
      category: CATEGORIES.includes(a.category as Category) ? (a.category as Category) : 'misc',
      qty: Math.max(1, Math.round(Number(a.qty) || 1)),
      match: [(a.label as string).toLowerCase()],
      source: 'ai' as const,
      note: typeof a.note === 'string' ? a.note : undefined,
    }))
}
