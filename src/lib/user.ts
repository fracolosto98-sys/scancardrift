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
/** Nombre en el archivo de copia → tabla local (los mazos cambiaron de tabla al pasar a ids UUID). */
const BACKUP_TABLES = {
  favs: 'favs', collection: 'collection', decks: 'deckList', deckCards: 'deckSlots', history: 'history', priceHist: 'priceHist',
} as const
type BackupKey = keyof typeof BACKUP_TABLES
const KEYS = Object.keys(BACKUP_TABLES) as BackupKey[]

export async function exportBackup(): Promise<Blob> {
  const data: Record<string, unknown> = { app: 'foilio', version: 2, exportedAt: new Date().toISOString() }
  for (const k of KEYS) data[k] = await db.table(BACKUP_TABLES[k]).toArray()
  return new Blob([JSON.stringify(data)], { type: 'application/json' })
}

/** Sustituye todos los datos del usuario por los de la copia. */
export async function importBackup(file: File): Promise<void> {
  let data: any
  try { data = JSON.parse(await file.text()) } catch { throw new Error('El archivo no es una copia válida.') }
  if (data?.app !== 'foilio' || !KEYS.every(k => data[k] === undefined || Array.isArray(data[k])))
    throw new Error('El archivo no es una copia de Foilio.')
  // Copias de la versión 1: los mazos tenían ids numéricos.
  const ids = new Map<unknown, string>()
  data.decks = data.decks?.map((d: any) => {
    if (typeof d.id === 'string') return d
    ids.set(d.id, crypto.randomUUID())
    return { ...d, id: ids.get(d.id) }
  })
  data.deckCards = data.deckCards?.flatMap((r: any) =>
    typeof r.deckId === 'string' ? [r] : ids.has(r.deckId) ? [{ ...r, deckId: ids.get(r.deckId) }] : [])
  await db.transaction('rw', KEYS.map(k => db.table(BACKUP_TABLES[k])), async () => {
    for (const k of KEYS) {
      await db.table(BACKUP_TABLES[k]).clear()
      if (data[k]?.length) await db.table(BACKUP_TABLES[k]).bulkPut(data[k])
    }
  })
}

/** Descarga un Blob como archivo. */
export function download(blob: Blob, filename: string) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
