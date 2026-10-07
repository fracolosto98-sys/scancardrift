import Dexie, { type Table } from 'dexie'
import { createWorker, type Worker } from 'tesseract.js'

export interface Card {
  id: string; riftboundId: string; name: string; cleanName: string; num: number
  energy: number | null; type: string; rarity: string; set: string; setName: string
  imgUrl: string; tcgId: string; alt: boolean; domains: string[]
}
export interface Finish { low: number | null; mid: number | null; high: number | null; market: number | null }
export interface PriceRow { riftboundId: string; purchaseUri: string; updatedAt: string; finishes: Record<string, Finish> }
export interface Deck { id?: number; name: string; createdAt: number }
export interface DeckCard { deckId: number; cardId: string; qty: number }

class AppDB extends Dexie {
  cards!: Table<Card, string>
  prices!: Table<PriceRow, string>
  kv!: Table<{ k: string; v: number }, string>
  favs!: Table<{ id: string }, string>
  history!: Table<{ n?: number; id: string; ts: number }, number>
  decks!: Table<Deck, number>
  deckCards!: Table<DeckCard, [number, string]>
  constructor() {
    super('scancard')
    this.version(3).stores({
      cards: 'id, name, set', prices: 'riftboundId', kv: 'k', favs: 'id', history: '++n, id, ts',
      decks: '++id', deckCards: '[deckId+cardId], deckId',
    })
  }
}
export const db = new AppDB()

const API = 'https://api.rifthunt.com'

async function refresh<T>(key: string, path: string, pick: (j: any) => T[], table: Table<T, string>) {
  const at = await db.kv.get(key)
  if (at && Date.now() - at.v < 864e5 && (await table.count())) return
  const r = await fetch(API + path)
  if (!r.ok) throw new Error(`${path} respondió ${r.status}`)
  const list = pick(await r.json())
  if (!Array.isArray(list)) throw new Error('Formato inesperado en ' + path)
  await db.transaction('rw', table, db.kv, async () => {
    await table.clear(); await table.bulkPut(list)
    await db.kv.put({ k: key, v: Date.now() })
  })
}

export async function ensureCatalog(): Promise<void> {
  await ensureRate()
  await refresh('catalogAt', '/bulk/cards', j => (Array.isArray(j) ? j : j.cards ?? j.data), db.cards)
  try { await refresh('pricesAt', '/bulk/prices', j => (Array.isArray(j) ? j : j.prices), db.prices) }
  catch (e) { console.warn('Precios no disponibles', e) }
}

// ---------- Moneda: USD (TCGplayer) → EUR (tipo de cambio del BCE vía Frankfurter) ----------
let usdEur: number | null = null
export const getRate = () => usdEur

const RATE_SOURCES: [string, (j: any) => unknown][] = [
  ['https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR', j => j?.rates?.EUR],
  ['https://api.frankfurter.app/latest?from=USD&to=EUR', j => j?.rates?.EUR],
  // Tercera opción, no verificada por mí: solo se usa si las dos anteriores fallan.
  ['https://open.er-api.com/v6/latest/USD', j => j?.rates?.EUR],
]

export async function ensureRate(): Promise<void> {
  const [rate, at] = await Promise.all([db.kv.get('fxRate'), db.kv.get('fxAt')])
  usdEur = rate?.v ?? null
  if (rate && at && Date.now() - at.v < 864e5) return
  for (const [url, pick] of RATE_SOURCES) {
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const eur = pick(await r.json())
      if (typeof eur === 'number' && eur > 0) {
        usdEur = eur
        await db.kv.bulkPut([{ k: 'fxRate', v: eur }, { k: 'fxAt', v: Date.now() }])
        return
      }
      throw new Error('Respuesta sin tipo EUR')
    } catch (e) {
      console.warn('Tipo de cambio: falló', url, e)
    }
  }
}

const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
/** Recibe USD y muestra EUR. Si no hay tipo de cambio, muestra USD. */
export const money = (usd: number | null | undefined) =>
  usd == null ? '—' : usdEur ? eurFmt.format(usd * usdEur) : `$${usd.toFixed(2)}`

export function finishList(p: PriceRow): [string, Finish][] {
  return Object.entries(p.finishes ?? {})
    .filter(([, f]) => f?.market != null)
    .sort(([a], [b]) => (a === 'normal' ? -1 : b === 'normal' ? 1 : 0))
}
export const cardPrice = (p: PriceRow): number | null => finishList(p)[0]?.[1].market ?? null

// ---------- Reconocimiento ----------
export const baseName = (c: Card) => c.name.replace(/\s*\(.*\)\s*$/, '')

let worker: Worker | null = null
export async function readText(canvas: HTMLCanvasElement): Promise<string> {
  worker ??= await createWorker('eng')
  return (await worker.recognize(canvas)).data.text
}

/** El código impreso pesa más; el nombre solo cuenta si aparece en una línea corta (título). */
export async function findCandidates(text: string): Promise<Card[]> {
  const up = text.toUpperCase()
  const lines = up.split('\n').map(l => l.trim()).filter(Boolean)
  const m = up.match(/\b([A-Z]{3})\s*[-–]?\s*(\d{3})/)
  const key = m ? `${m[1].toLowerCase()}-${m[2]}` : ''
  const scored = (await db.cards.toArray())
    .map(c => {
      let s = 0
      if (key && c.riftboundId?.startsWith(key)) s += 5
      const name = baseName(c).toUpperCase()
      if (name.length >= 4 && lines.some(l => l.includes(name) && l.length <= name.length + 8)) s += 3
      return { c, s }
    })
    .filter(x => x.s >= 3)
  const best = Math.max(0, ...scored.map(x => x.s))
  return scored.filter(x => x.s === best).slice(0, 6).map(x => x.c)
}

// ---------- Mazos ----------
export type Zone = 'legend' | 'runes' | 'battlefields' | 'main'
export const zoneOf = (c: Card): Zone => {
  const t = (c.type ?? '').toLowerCase()
  return t.startsWith('legend') ? 'legend' : t.startsWith('rune') ? 'runes' : t.startsWith('battlefield') ? 'battlefields' : 'main'
}

/** Añade una copia respetando las reglas. Devuelve un mensaje si no se puede. */
export async function addToDeck(deckId: number, card: Card): Promise<string | null> {
  const rows = await db.deckCards.where('deckId').equals(deckId).toArray()
  const cards = await db.cards.bulkGet(rows.map(r => r.cardId))
  const z = zoneOf(card)
  const inZone = rows.map((r, i) => ({ r, c: cards[i] })).filter(x => x.c && zoneOf(x.c) === z)
  const total = inZone.reduce((s, x) => s + x.r.qty, 0)
  const same = inZone.filter(x => baseName(x.c!) === baseName(card)).reduce((s, x) => s + x.r.qty, 0)

  if (z === 'legend') {
    await db.deckCards.bulkDelete(inZone.map(x => [deckId, x.r.cardId] as [number, string]))
    await db.deckCards.put({ deckId, cardId: card.id, qty: 1 })
    return null
  }
  if (z === 'runes' && total >= 12) return 'El mazo de runas ya tiene 12.'
  if (z === 'battlefields' && same >= 1) return 'Los campos de batalla deben ser distintos.'
  if (z === 'battlefields' && total >= 3) return 'Ya tienes 3 campos de batalla.'
  if (z === 'main' && same >= 3) return 'Máximo 3 copias del mismo nombre.'
  const cur = await db.deckCards.get([deckId, card.id])
  await db.deckCards.put({ deckId, cardId: card.id, qty: (cur?.qty ?? 0) + 1 })
  return null
}