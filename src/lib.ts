import Dexie, { type Table } from 'dexie'
import { createWorker, type Worker } from 'tesseract.js'

export interface Card {
  id: string; riftboundId: string; name: string; cleanName: string; num: number
  energy: number | null; type: string; rarity: string; set: string; setName: string
  imgUrl: string; tcgId: string; alt: boolean
}
export interface Finish { low: number | null; mid: number | null; high: number | null; market: number | null }
export interface PriceRow { riftboundId: string; purchaseUri: string; updatedAt: string; finishes: Record<string, Finish> }

class AppDB extends Dexie {
  cards!: Table<Card, string>
  prices!: Table<PriceRow, string>
  kv!: Table<{ k: string; v: number }, string>
  favs!: Table<{ id: string }, string>
  history!: Table<{ n?: number; id: string; ts: number }, number>
  constructor() {
    super('scancard')
    this.version(2).stores({ cards: 'id, name, set', prices: 'riftboundId', kv: 'k', favs: 'id', history: '++n, id, ts' })
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
  await refresh('catalogAt', '/bulk/cards', j => (Array.isArray(j) ? j : j.cards ?? j.data), db.cards)
  try { await refresh('pricesAt', '/bulk/prices', j => (Array.isArray(j) ? j : j.prices), db.prices) }
  catch (e) { console.warn('Precios no disponibles', e) } // la app funciona sin precios
}

/** Acabados con precio de mercado, normal primero. */
export function finishList(p: PriceRow): [string, Finish][] {
  return Object.entries(p.finishes ?? {})
    .filter(([, f]) => f?.market != null)
    .sort(([a], [b]) => (a === 'normal' ? -1 : b === 'normal' ? 1 : 0))
}
export const money = (n: number | null | undefined) => (n == null ? '—' : `$${n.toFixed(2)}`)

let worker: Worker | null = null
export async function readText(canvas: HTMLCanvasElement): Promise<string> {
  worker ??= await createWorker('eng')
  return (await worker.recognize(canvas)).data.text
}

/** Busca por código impreso (OGN-001 → ogn-001-…) y por nombre. */
export async function findCandidates(text: string): Promise<Card[]> {
  const t = text.toUpperCase()
  const m = t.match(/\b([A-Z]{3})\s*[-–]?\s*(\d{3})/)
  const key = m ? `${m[1].toLowerCase()}-${m[2]}` : ''
  const all = await db.cards.toArray()
  return all
    .map(c => {
      let s = 0
      if (key && c.riftboundId?.startsWith(key)) s += 5
      const name = (c.cleanName ?? c.name ?? '').toUpperCase()
      if (name.length > 3 && t.includes(name)) s += 3
      return { c, s }
    })
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6).map(x => x.c)
}