import Dexie, { type Table } from 'dexie'
import { createWorker, type Worker } from 'tesseract.js'

export interface Card {
  id: string; name: string; oracle_name: string; type: string; energy: number | null
  set: string; set_name: string; collector_number: string; rarity: string; variant: string | null
  images: { full: string; thumb: string }; prices: unknown
}
class AppDB extends Dexie {
  cards!: Table<Card, string>
  kv!: Table<{ k: string; v: number }, string>
  favs!: Table<{ id: string }, string>
  history!: Table<{ n?: number; id: string; ts: number }, number>
  constructor() {
    super('scancard')
    this.version(1).stores({ cards: 'id, oracle_name, set', kv: 'k', favs: 'id', history: '++n, id, ts' })
  }
}
export const db = new AppDB()

const API = 'https://api.rifthunt.com'

/** Descarga el catálogo completo (~1,2 MB) como máximo una vez al día. */
export async function ensureCatalog(): Promise<void> {
  const at = await db.kv.get('catalogAt')
  if (at && Date.now() - at.v < 864e5 && (await db.cards.count())) return
  const r = await fetch(`${API}/bulk/cards`)
  if (!r.ok) throw new Error('No se pudo descargar el catálogo')
const j = await r.json()
const list = (Array.isArray(j) ? j : j.data ?? j.cards ?? Object.values(j).find(Array.isArray)) as Card[]
if (!Array.isArray(list)) throw new Error('Formato inesperado: ' + Object.keys(j).join(', '))
  await db.transaction('rw', db.cards, db.kv, async () => {
    await db.cards.clear(); await db.cards.bulkPut(list)
    await db.kv.put({ k: 'catalogAt', v: Date.now() })
  })
}

/** Extrae precios USD por acabado. Tolera varias formas del objeto `prices` (ver README). */
export function usdPrices(c: Card): { finish: string; usd: number }[] {
  const p = c.prices as Record<string, unknown> | null
  if (!p) return []
  const f = (p.finishes ?? p) as Record<string, any>
  return Object.entries(f)
    .map(([finish, x]) => ({ finish, usd: Number(x?.market ?? x?.marketPrice ?? x) }))
    .filter(o => Number.isFinite(o.usd) && o.usd > 0)
}

let worker: Worker | null = null
export async function readText(canvas: HTMLCanvasElement): Promise<string> {
  worker ??= await createWorker('eng')
  return (await worker.recognize(canvas)).data.text
}

/** Puntúa candidatos: código de colección (p. ej. OGN-045) y nombre. */
export async function findCandidates(text: string): Promise<Card[]> {
  const t = text.toUpperCase()
  const m = t.match(/\b([A-Z]{3})\s*[-–]?\s*(\d{3})/)
  const all = await db.cards.toArray()
  return all
    .map(c => {
      let s = 0
      const set = (c.set ?? '').toLowerCase()
      const num = c.collector_number ?? ''
      const name = (c.oracle_name ?? c.name ?? '').toUpperCase()
      if (m && set === m[1].toLowerCase() && num.startsWith(m[2])) s += 5
      if (name.length > 3 && t.includes(name)) s += 3
      return { c, s }
    })
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6).map(x => x.c)
}
