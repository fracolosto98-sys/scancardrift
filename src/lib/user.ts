import { db, type FinishName } from './db'

// ---------- Colección ----------
export async function addOwned(cardId: string, finish: FinishName, delta: number) {
  await db.transaction('rw', db.collection, async () => {
    const cur = await db.collection.get([cardId, finish])
    const qty = (cur?.qty ?? 0) + delta
    if (qty <= 0) await db.collection.delete([cardId, finish])
    else await db.collection.put({ cardId, finish, qty, addedAt: cur?.addedAt ?? Date.now() })
  })
}

export const toggleFav = async (id: string) =>
  (await db.favs.get(id)) ? (await db.favs.delete(id), false) : (await db.favs.put({ id }), true)

const HISTORY_MAX = 100
export async function addHistory(id: string) {
  await db.history.add({ id, ts: Date.now() })
  const n = await db.history.count()
  if (n > HISTORY_MAX) await db.history.orderBy('ts').limit(n - HISTORY_MAX).delete()
}

// ---------- Copia de seguridad ----------
const USER_TABLES = ['favs', 'collection', 'decks', 'deckCards', 'history', 'priceHist'] as const

export async function exportBackup(): Promise<Blob> {
  const data: Record<string, unknown> = { app: 'foilio', version: 1, exportedAt: new Date().toISOString() }
  for (const t of USER_TABLES) data[t] = await db.table(t).toArray()
  return new Blob([JSON.stringify(data)], { type: 'application/json' })
}

/** Sustituye todos los datos del usuario por los de la copia. */
export async function importBackup(file: File): Promise<void> {
  let data: any
  try { data = JSON.parse(await file.text()) } catch { throw new Error('El archivo no es una copia válida.') }
  if (data?.app !== 'foilio' || !USER_TABLES.every(t => data[t] === undefined || Array.isArray(data[t])))
    throw new Error('El archivo no es una copia de Foilio.')
  await db.transaction('rw', USER_TABLES.map(t => db.table(t)), async () => {
    for (const t of USER_TABLES) {
      await db.table(t).clear()
      if (data[t]?.length) await db.table(t).bulkPut(data[t])
    }
  })
}

/** Descarga un Blob como archivo. */
export function download(blob: Blob, filename: string) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
