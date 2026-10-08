import type { SupabaseClient } from '@supabase/supabase-js'
import { liveQuery, type Table } from 'dexie'
import { db, getKv, setKv } from './db'
import { planSync, stable, type LocalEntry, type PushRow, type RemoteRow, type SyncTable } from './syncplan'
import { SUPABASE_KEY, SUPABASE_URL } from '../config'

// ---------- Estado observable desde React (useSyncExternalStore) ----------
export interface CloudState {
  user: { id: string; email?: string } | null
  status: 'off' | 'idle' | 'syncing' | 'error'
  lastSync: number | null
  error?: string
}
let state: CloudState = { user: null, status: 'off', lastSync: null }
const listeners = new Set<() => void>()
const setState = (p: Partial<CloudState>) => { state = { ...state, ...p }; listeners.forEach(l => l()) }
export const cloudStore = {
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
  get: () => state,
}

// ---------- Tablas que se sincronizan ----------
type Spec = { table: () => Table<any, any>; key: (r: any) => string; pk: (key: string) => unknown; valid: (r: any) => boolean }
const str = (v: unknown) => typeof v === 'string' && v.length > 0
const SPECS: Record<SyncTable, Spec> = {
  favs: { table: () => db.favs, key: r => r.id, pk: k => k, valid: r => str(r?.id) },
  collection: {
    table: () => db.collection, key: r => `${r.cardId}|${r.finish}`, pk: k => k.split('|'),
    valid: r => str(r?.cardId) && (r.finish === 'normal' || r.finish === 'foil') && Number.isInteger(r.qty) && r.qty > 0,
  },
  decks: { table: () => db.deckList, key: r => r.id, pk: k => k, valid: r => str(r?.id) && typeof r.name === 'string' },
  deckCards: {
    table: () => db.deckSlots, key: r => `${r.deckId}|${r.cardId}`, pk: k => k.split('|'),
    valid: r => str(r?.deckId) && str(r.cardId) && Number.isInteger(r.qty) && r.qty > 0,
  },
}
const TABLES = Object.keys(SPECS) as SyncTable[]
const userTables = () => TABLES.map(t => SPECS[t].table())

async function readLocal(): Promise<LocalEntry[]> {
  const out: LocalEntry[] = []
  for (const tbl of TABLES) for (const data of await SPECS[tbl].table().toArray()) out.push({ tbl, key: SPECS[tbl].key(data), data })
  return out
}

// ---------- Cliente de Supabase: solo se carga si hay sesión o al iniciar sesión ----------
const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
let clientP: Promise<SupabaseClient> | null = null

function client(): Promise<SupabaseClient> {
  clientP ??= import('@supabase/supabase-js').then(({ createClient }) => {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    sb.auth.onAuthStateChange((event, session) => {
      const user = session ? { id: session.user.id, email: session.user.email } : null
      setState({ user, status: user ? (state.status === 'off' ? 'idle' : state.status) : 'off' })
      // Supabase recomienda no llamarle desde dentro de este callback: se sincroniza en la siguiente vuelta.
      if (user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) setTimeout(() => sync(), 0)
    })
    return sb
  }).catch(e => { clientP = null; throw e })
  return clientP
}

let started = false
/** Arranque: recupera la sesión (o la crea si se vuelve del enlace del email) y sincroniza ante cambios. */
export function initCloud() {
  if (started) return
  started = true
  getKv<number>('syncAt').then(t => setState({ lastSync: t ?? null }))
  const fromEmail = /[?&](code|error_description)=/.test(location.search)
  if (localStorage.getItem(STORAGE_KEY) || fromEmail) {
    client().then(async sb => {
      await sb.auth.getSession() // espera a que se canjee el código del enlace
      const err = new URLSearchParams(location.search).get('error_description')
      if (err) setState({ error: err })
      if (fromEmail) history.replaceState(null, '', location.pathname + location.hash)
    }).catch(e => setState({ status: 'error', error: message(e) }))
  }
  // Cualquier cambio local se sube a los pocos segundos; al volver a la app o recuperar conexión, se descarga lo nuevo.
  let timer: ReturnType<typeof setTimeout> | undefined
  liveQuery(() => Promise.all(userTables().map(t => t.toArray()))).subscribe({
    next: () => { clearTimeout(timer); timer = setTimeout(() => { if (state.user) sync() }, 2000) },
  })
  addEventListener('online', () => { if (state.user) sync() })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.user) sync() })
}

// ---------- Cuenta ----------
function message(e: unknown): string {
  const m = (e as { message?: string; status?: number })
  if (m?.status === 429 || /rate limit|only request this after/i.test(m?.message ?? '')) return 'Demasiados intentos. Espera un minuto y vuelve a probar.'
  if (/expired|invalid/i.test(m?.message ?? '')) return 'El código no es correcto o ha caducado.'
  if (e instanceof TypeError) return 'Sin conexión con el servidor.'
  return m?.message ?? String(e)
}

/** Envía un email con un enlace y un código para entrar (sin contraseña). */
export async function sendLoginEmail(email: string) {
  const sb = await client()
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } })
  if (error) throw new Error(message(error))
}

export async function verifyLoginCode(email: string, token: string) {
  const sb = await client()
  const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw new Error(message(error))
}

/** Cierra la sesión. Los datos se quedan en el dispositivo y se vuelven a sincronizar al entrar. */
export async function signOut() {
  const sb = await client()
  await sb.auth.signOut({ scope: 'local' })
  setState({ user: null, status: 'off' })
}

/** Borra la cuenta y todos sus datos en la nube. Lo del dispositivo se conserva. */
export async function deleteAccount() {
  const sb = await client()
  const { error } = await sb.rpc('delete_my_account')
  if (error) throw new Error(message(error))
  await sb.auth.signOut({ scope: 'local' })
  await db.syncShadow.clear()
  await db.kv.bulkDelete(['syncUser', 'syncCursor', 'syncAt'])
  setState({ user: null, status: 'off', lastSync: null })
}

// ---------- Sincronización ----------
const PAGE = 1000
const OVERLAP_MS = 60_000 // se vuelve a pedir el último minuto por si alguna escritura llegó con retraso

let running: Promise<void> | null = null
let again = false
export function sync(): Promise<void> {
  if (running) { again = true; return running }
  running = doSync()
    .then(() => setState({ status: 'idle', error: undefined }))
    .catch(e => { console.warn('Sincronización fallida', e); setState({ status: 'error', error: message(e) }) })
    .finally(() => { running = null; if (again) { again = false; sync() } })
  return running
}

async function doSync() {
  const user = state.user
  if (!user) return
  const sb = await client()
  setState({ status: 'syncing' })

  // Otro usuario en este dispositivo: se empieza de cero (sus datos locales se fusionan con la cuenta nueva).
  if ((await getKv('syncUser')) !== user.id) {
    await db.syncShadow.clear()
    await db.kv.delete('syncCursor')
    await setKv('syncUser', user.id)
  }
  const cursor = await getKv<string>('syncCursor')
  const first = !cursor

  // 1) Descargar lo cambiado desde la última vez.
  const remote: RemoteRow[] = []
  const since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null
  for (let from = 0; ; from += PAGE) {
    let q = sb.from('user_rows').select('tbl,key,data,deleted,updated_at,synced_at')
    if (since) q = q.gt('synced_at', since)
    const { data, error } = await q.order('synced_at').order('tbl').order('key').range(from, from + PAGE - 1)
    if (error) throw error
    remote.push(...(data as RemoteRow[]).filter(r => SPECS[r.tbl]))
    if (data.length < PAGE) break
  }

  // 2) Decidir y aplicar en el dispositivo.
  const plan = planSync(await readLocal(), await db.syncShadow.toArray(), remote, first)
  await db.transaction('rw', [...userTables(), db.syncShadow], async () => {
    for (const r of plan.apply) {
      const spec = SPECS[r.tbl]
      if (r.deleted || !r.data) {
        await spec.table().delete(spec.pk(r.key) as never)
        await db.syncShadow.delete([r.tbl, r.key])
      } else if (spec.valid(r.data) && spec.key(r.data) === r.key) {
        await spec.table().put(r.data)
        await db.syncShadow.put({ tbl: r.tbl, key: r.key, json: stable(r.data) })
      }
    }
    for (const r of plan.same) {
      if (r.deleted || !r.data) await db.syncShadow.delete([r.tbl, r.key])
      else await db.syncShadow.put({ tbl: r.tbl, key: r.key, json: stable(r.data) })
    }
  })

  // 3) Subir los cambios locales.
  const now = Date.now()
  for (let i = 0; i < plan.push.length; i += 500) {
    const chunk: PushRow[] = plan.push.slice(i, i + 500)
    const { error } = await sb.rpc('sync_push', { rows: chunk.map(r => ({ ...r, updated_at: now })) })
    if (error) throw error
    await db.transaction('rw', db.syncShadow, async () => {
      for (const r of chunk) {
        if (r.deleted) await db.syncShadow.delete([r.tbl, r.key])
        else await db.syncShadow.put({ tbl: r.tbl, key: r.key, json: stable(r.data) })
      }
    })
  }

  const newest = remote.reduce((m, r) => (r.synced_at > m ? r.synced_at : m), cursor ?? '1970-01-01T00:00:00Z')
  await setKv('syncCursor', newest)
  await setKv('syncAt', now)
  setState({ lastSync: now })
}
