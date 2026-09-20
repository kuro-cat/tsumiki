import type { Category, CheckItem, Climate, TripKind } from '../store'

export const ACTIVITIES = ['hiking', 'swimming', 'running', 'photography', 'camping', 'formal event', 'work', 'cycling', 'skiing'] as const
export type TripInput = { nights: number; climate: Climate; kind: TripKind; activities: string[] }

type Rule = { label: string; category: Category; match: string[]; qty?: (nights: number) => number; when?: (t: TripInput) => boolean }

const cap = (n: number, max: number) => Math.min(max, Math.max(1, Math.ceil(n)))
const has = (a: string) => (t: TripInput) => t.activities.includes(a)
const cold = (t: TripInput) => t.climate === 'cold'
const business = (t: TripInput) => t.kind === 'business' || has('work')(t)

const RULES: Rule[] = [
  { label: 'Passport or ID', category: 'documents', match: ['passport', 'id card'] },
  { label: 'Wallet and cards', category: 'documents', match: ['wallet'] },
  { label: 'Phone charger', category: 'electronics', match: ['phone charger', 'charger'] },
  { label: 'Power bank', category: 'electronics', match: ['power bank', 'battery pack'], when: (t) => t.nights >= 2 },
  { label: 'Headphones', category: 'electronics', match: ['headphone', 'earbud'] },
  { label: 'Toiletry kit', category: 'toiletries', match: ['toiletry', 'wash bag', 'dopp'] },
  { label: 'Toothbrush and toothpaste', category: 'toiletries', match: ['toothbrush'] },
  { label: 'Deodorant', category: 'toiletries', match: ['deodorant'] },
  { label: 'Medication and plasters', category: 'toiletries', match: ['medic', 'first aid', 'plaster'] },
  { label: 'Underwear', category: 'clothing', match: ['underwear', 'briefs', 'boxer'], qty: (n) => cap(n + 1, 7) },
  { label: 'Socks', category: 'clothing', match: ['sock'], qty: (n) => cap(n + 1, 7) },
  { label: 'T-shirts', category: 'clothing', match: ['t-shirt', 'tee', 'shirt'], qty: (n) => cap(n / 1.5, 6) },
  { label: 'Trousers', category: 'clothing', match: ['jeans', 'trouser', 'pants', 'chinos'], qty: (n) => cap(n / 3, 3) },
  { label: 'Sleepwear', category: 'clothing', match: ['sleep', 'pyjama', 'pajama'] },
  { label: 'Water bottle', category: 'gear', match: ['bottle'] },
  { label: 'Laundry bag', category: 'gear', match: ['laundry'], when: (t) => t.nights >= 3 },
  { label: 'Sunscreen', category: 'toiletries', match: ['sunscreen', 'spf'], when: (t) => t.climate === 'hot' || t.kind === 'beach' },
  { label: 'Sunglasses', category: 'gear', match: ['sunglass'], when: (t) => !cold(t) },
  { label: 'Sun hat or cap', category: 'clothing', match: ['hat', 'cap'], when: (t) => t.climate === 'hot' },
  { label: 'Shorts', category: 'clothing', match: ['shorts'], qty: (n) => cap(n / 2, 4), when: (t) => t.climate === 'hot' },
  { label: 'Sandals', category: 'footwear', match: ['sandal', 'flip'], when: (t) => t.climate === 'hot' || t.kind === 'beach' },
  { label: 'Insulated jacket', category: 'clothing', match: ['down', 'insulated', 'puffer', 'winter jacket'], when: cold },
  { label: 'Thermal base layers', category: 'clothing', match: ['thermal', 'base layer', 'merino'], qty: () => 2, when: cold },
  { label: 'Gloves', category: 'clothing', match: ['glove'], when: cold },
  { label: 'Beanie', category: 'clothing', match: ['beanie', 'wool hat'], when: cold },
  { label: 'Scarf', category: 'clothing', match: ['scarf'], when: cold },
  { label: 'Light jacket', category: 'clothing', match: ['jacket', 'fleece', 'hoodie'], when: (t) => t.climate === 'mild' || t.climate === 'mixed' },
  { label: 'Rain jacket', category: 'clothing', match: ['rain', 'shell'], when: (t) => t.climate === 'mixed' || t.kind === 'outdoor' },
  { label: 'Packable umbrella', category: 'gear', match: ['umbrella'], when: (t) => t.climate === 'mixed' && t.kind === 'city' },
  { label: 'Swimwear', category: 'clothing', match: ['swim', 'trunks', 'bikini'], qty: () => 2, when: (t) => t.kind === 'beach' || has('swimming')(t) },
  { label: 'Travel towel', category: 'gear', match: ['towel'], when: (t) => t.kind === 'beach' || t.kind === 'outdoor' },
  { label: 'Walking shoes', category: 'footwear', match: ['sneaker', 'trainer', 'walking', 'running shoe'], when: (t) => t.kind === 'city' || t.kind === 'business' },
  { label: 'Day bag', category: 'gear', match: ['day bag', 'daypack', 'tote', 'sling'], when: (t) => t.kind === 'city' || t.kind === 'beach' },
  { label: 'Hiking boots', category: 'footwear', match: ['boot'], when: (t) => t.kind === 'outdoor' || has('hiking')(t) },
  { label: 'Daypack', category: 'gear', match: ['daypack'], when: (t) => t.kind === 'outdoor' || has('hiking')(t) },
  { label: 'Headlamp', category: 'gear', match: ['headlamp', 'torch', 'flashlight'], when: (t) => t.kind === 'outdoor' || has('camping')(t) },
  { label: 'Laptop', category: 'electronics', match: ['laptop', 'macbook'], when: business },
  { label: 'Laptop charger', category: 'electronics', match: ['laptop charger', 'usb-c charger'], when: business },
  { label: 'Dress shirts', category: 'clothing', match: ['dress shirt', 'button'], qty: (n) => cap(n / 1.5, 5), when: (t) => t.kind === 'business' },
  { label: 'Blazer', category: 'clothing', match: ['blazer', 'suit jacket'], when: (t) => t.kind === 'business' },
  { label: 'Dress shoes', category: 'footwear', match: ['dress shoe', 'oxford', 'loafer'], when: (t) => t.kind === 'business' || has('formal event')(t) },
  { label: 'Notebook and pen', category: 'misc', match: ['notebook', 'pen'], when: business },
  { label: 'Blister plasters', category: 'toiletries', match: ['blister'], when: has('hiking') },
  { label: 'Swim goggles', category: 'gear', match: ['goggle'], when: has('swimming') },
  { label: 'Running shoes', category: 'footwear', match: ['running shoe', 'runner'], when: has('running') },
  { label: 'Running kit', category: 'clothing', match: ['running short', 'running top', 'sports'], qty: () => 2, when: has('running') },
  { label: 'Camera', category: 'electronics', match: ['camera'], when: has('photography') },
  { label: 'Spare camera battery and cards', category: 'electronics', match: ['camera battery', 'memory card', 'sd card'], when: has('photography') },
  { label: 'Sleeping bag', category: 'gear', match: ['sleeping bag'], when: has('camping') },
  { label: 'Tent', category: 'gear', match: ['tent'], when: has('camping') },
  { label: 'Camp stove', category: 'gear', match: ['stove'], when: has('camping') },
  { label: 'Formal outfit', category: 'clothing', match: ['suit', 'dress', 'formal'], when: has('formal event') },
  { label: 'Helmet', category: 'gear', match: ['helmet'], when: has('cycling') },
  { label: 'Cycling kit', category: 'clothing', match: ['cycling', 'jersey', 'bib'], qty: () => 2, when: has('cycling') },
  { label: 'Ski jacket and pants', category: 'clothing', match: ['ski'], when: has('skiing') },
  { label: 'Ski goggles', category: 'gear', match: ['ski goggle', 'goggle'], when: has('skiing') },
]

export function suggest(t: TripInput): Omit<CheckItem, 'id' | 'packed'>[] {
  const seen = new Set<string>()
  const out: Omit<CheckItem, 'id' | 'packed'>[] = []
  for (const r of RULES) {
    if (r.when && !r.when(t)) continue
    if (seen.has(r.label)) continue
    seen.add(r.label)
    out.push({ label: r.label, category: r.category, match: r.match, qty: r.qty ? r.qty(t.nights) : 1, source: 'rule' })
  }
  return out
}
