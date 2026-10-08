import { db, getKv, setKv, type Card, type PriceRow } from './db'

const API = 'https://api.rifthunt.com'
const DAY = 864e5

async function getJson(url: string, timeout = 30_000): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout) })
  if (!r.ok) throw new Error(`${new URL(url).host} respondió ${r.status}`)
  return r.json()
}

const fresh = async (key: string) => Date.now() - ((await getKv<number>(key)) ?? 0) < DAY

async function refreshCards(force: boolean) {
  if (!force && (await fresh('catalogAt')) && (await db.cards.count())) return
  const j = await getJson(API + '/bulk/cards')
  const list: Card[] = Array.isArray(j) ? j : j.cards ?? j.data
  if (!Array.isArray(list) || !list.length) throw new Error('Formato inesperado del catálogo')
  await db.transaction('rw', db.cards, db.kv, async () => {
    await db.cards.clear(); await db.cards.bulkPut(list)
    await setKv('catalogAt', Date.now())
  })
}

async function refreshPrices(force: boolean) {
  if (!force && (await fresh('pricesAt')) && (await db.market.count())) return
  const j = await getJson(API + '/bulk/prices')
  const list: PriceRow[] = (Array.isArray(j) ? j : j.prices)?.filter((p: PriceRow) => p?.tcgId)
  if (!Array.isArray(list) || !list.length) throw new Error('Formato inesperado de los precios')
  await db.transaction('rw', db.market, db.kv, async () => {
    await db.market.clear(); await db.market.bulkPut(list)
    await setKv('pricesAt', Date.now())
  })
  await snapshotPrices(list)
}

/** Guarda el precio de hoy de las cartas en colección o favoritos, para poder mostrar su evolución. */
async function snapshotPrices(list: PriceRow[]) {
  const ids = new Set([...(await db.collection.toArray()).map(o => o.cardId), ...(await db.favs.toArray()).map(f => f.id)])
  if (!ids.size) return
  const tcg = new Set((await db.cards.bulkGet([...ids])).map(c => c?.tcgId).filter(Boolean))
  const day = new Date().toISOString().slice(0, 10)
  await db.priceHist.bulkPut(list.filter(p => tcg.has(p.tcgId)).map(p => ({
    tcgId: p.tcgId, day, normal: p.finishes?.normal?.market ?? null, foil: p.finishes?.foil?.market ?? null,
  })))
}

// ---------- Tipo de cambio USD → EUR ----------
const RATE_SOURCES: [string, (j: any) => unknown][] = [
  ['https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR', j => j?.rates?.EUR],
  ['https://api.frankfurter.app/latest?from=USD&to=EUR', j => j?.rates?.EUR],
  ['https://open.er-api.com/v6/latest/USD', j => j?.rates?.EUR],
]

async function refreshRate(force: boolean) {
  if (!force && (await fresh('fxAt')) && (await getKv('fxRate'))) return
  for (const [url, pick] of RATE_SOURCES) {
    try {
      const eur = pick(await getJson(url, 10_000))
      if (typeof eur === 'number' && eur > 0) {
        await db.kv.bulkPut([{ k: 'fxRate', v: eur }, { k: 'fxAt', v: Date.now() }])
        return
      }
    } catch (e) { console.warn('Tipo de cambio: falló', url, e) }
  }
  throw new Error('No se pudo obtener el tipo de cambio')
}

export const hasCatalog = async () => (await db.cards.count()) > 0

let running: Promise<string[]> | null = null
/**
 * Actualiza catálogo, precios y tipo de cambio si tienen más de un día (o siempre, con force).
 * Devuelve la lista de fallos; solo lanza si no hay catálogo, que es lo único imprescindible.
 */
export function syncAll(force = false): Promise<string[]> {
  running ??= (async () => {
    const results = await Promise.allSettled([refreshCards(force), refreshPrices(force), refreshRate(force)])
    const errors = results.flatMap(r => r.status === 'rejected' ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : [])
    if (errors.length) console.warn('Sincronización incompleta', errors)
    if (results[0].status === 'rejected' && !(await hasCatalog())) throw results[0].reason
    return errors
  })().finally(() => { running = null })
  return running
}
