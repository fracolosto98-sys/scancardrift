// Módulo puro (sin Dexie ni red) para poder probarlo con `npm test`.

export type SyncTable = 'favs' | 'collection' | 'decks' | 'deckCards'
/** Una fila del usuario tal como está en el dispositivo. */
export interface LocalEntry { tbl: SyncTable; key: string; data: Record<string, unknown> }
/** Última versión sincronizada de una fila. */
export interface ShadowEntry { tbl: string; key: string; json: string }
/** Una fila tal como llega del servidor. */
export interface RemoteRow { tbl: SyncTable; key: string; data: Record<string, unknown> | null; deleted: boolean; updated_at: number; synced_at: string }
export interface PushRow { tbl: SyncTable; key: string; data: Record<string, unknown> | null; deleted: boolean }
export interface SyncPlan {
  /** Cambios remotos que hay que escribir en el dispositivo. */
  apply: RemoteRow[]
  /** Filas remotas que ya coinciden con lo local: solo hay que marcarlas como sincronizadas. */
  same: RemoteRow[]
  /** Cambios locales que hay que subir. */
  push: PushRow[]
}

/** JSON con las claves ordenadas: Postgres (jsonb) no conserva el orden y así se comparan bien. */
export const stable = (o: unknown) => JSON.stringify(o, o && typeof o === 'object' ? Object.keys(o).sort() : undefined)
const id = (tbl: string, key: string) => `${tbl}\u0000${key}`

/**
 * Decide qué hacer en una sincronización.
 * - Lo que difiere de la última versión sincronizada es un cambio local y se sube (también los borrados).
 * - Un cambio remoto se aplica salvo que esa misma fila tenga un cambio local pendiente: entonces gana el local,
 *   que es más reciente. En la primera sincronización de un dispositivo gana la nube (lo local solo se añade).
 */
export function planSync(local: LocalEntry[], shadow: ShadowEntry[], remote: RemoteRow[], first: boolean): SyncPlan {
  const localById = new Map(local.map(e => [id(e.tbl, e.key), e]))
  const shadowById = new Map(shadow.map(s => [id(s.tbl, s.key), s.json]))
  const push = new Map<string, PushRow>()
  for (const [k, e] of localById) if (shadowById.get(k) !== stable(e.data)) push.set(k, { tbl: e.tbl, key: e.key, data: e.data, deleted: false })
  if (!first) for (const s of shadow) if (!localById.has(id(s.tbl, s.key))) push.set(id(s.tbl, s.key), { tbl: s.tbl as SyncTable, key: s.key, data: null, deleted: true })

  // Si una fila llega varias veces (páginas solapadas), vale la última.
  const latest = new Map<string, RemoteRow>()
  for (const r of [...remote].sort((a, b) => a.synced_at.localeCompare(b.synced_at))) latest.set(id(r.tbl, r.key), r)

  const apply: RemoteRow[] = [], same: RemoteRow[] = []
  for (const [k, r] of latest) {
    const mine = localById.get(k)
    const removed = r.deleted || !r.data
    if (!removed && mine && stable(mine.data) === stable(r.data)) { same.push(r); push.delete(k); continue }
    if (removed && !mine) { same.push(r); push.delete(k); continue }
    if (push.has(k)) {
      if (!first || removed) continue // gana el cambio local
      push.delete(k) // primera sincronización: gana la nube
    }
    apply.push(r)
  }
  return { apply, same, push: [...push.values()] }
}
