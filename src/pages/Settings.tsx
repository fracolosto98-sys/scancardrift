import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, download, exportBackup, importBackup, setKv, syncAll, type Currency } from '../lib'
import { useCatalog, useToast } from '../state'
import { Segmented } from '../components/bits'
import Account from '../components/Account'
import { HAS_AFFILIATES, MONEY } from '../config'

const when = (ts: unknown) => typeof ts === 'number' ? new Date(ts).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : 'nunca'

export default function Settings() {
  const toast = useToast()
  const { currency, rate, cards } = useCatalog()
  const kv = useLiveQuery(() => db.kv.bulkGet(['catalogAt', 'pricesAt', 'fxAt']), [])
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  async function sync() {
    setBusy(true)
    try {
      const errs = await syncAll(true)
      toast(errs.length ? `Actualizado con avisos: ${errs.join('; ')}` : 'Datos actualizados')
    } catch (e) { toast(`No se pudo actualizar: ${(e as Error).message}`) }
    setBusy(false)
  }
  async function backup() {
    download(await exportBackup(), `foilio-copia-${new Date().toISOString().slice(0, 10)}.json`)
  }
  async function restore(f: File | undefined) {
    if (!f || !confirm('Esto sustituirá tu colección, favoritos, mazos e historial por los de la copia. ¿Continuar?')) return
    try { await importBackup(f); toast('Copia restaurada') } catch (e) { toast((e as Error).message) }
    if (file.current) file.current.value = ''
  }
  async function clearHistory() {
    if (confirm('¿Borrar el historial de cartas consultadas?')) { await db.history.clear(); toast('Historial borrado') }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold pt-2">Ajustes</h1>

      <Account />

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Moneda</h2>
        <Segmented<Currency> label="Moneda" value={currency} onChange={v => setKv('currency', v)} options={[['EUR', 'Euros (€)'], ['USD', 'Dólares ($)']]} />
        <p className="text-xs muted">
          Los precios son de TCGplayer (EE. UU.) en dólares.
          {rate ? ` Para euros se usa el tipo del BCE: 1 USD = ${rate.toFixed(4)} €.` : ' Aún no hay tipo de cambio: se muestran en dólares.'}
        </p>
      </section>

      <section className="card p-4 space-y-2">
        <h2 className="font-semibold">Datos</h2>
        <p className="text-sm muted">{cards.length} cartas en el catálogo.</p>
        <ul className="text-sm muted">
          <li>Catálogo: {when(kv?.[0]?.v)}</li>
          <li>Precios: {when(kv?.[1]?.v)}</li>
          <li>Tipo de cambio: {when(kv?.[2]?.v)}</li>
        </ul>
        <p className="text-xs muted">Se actualizan solos una vez al día al abrir la app.</p>
        <button className="btn btn-ghost" onClick={sync} disabled={busy}>{busy ? 'Actualizando…' : 'Actualizar ahora'}</button>
      </section>

      <section className="card p-4 space-y-2">
        <h2 className="font-semibold">Copia de seguridad</h2>
        <p className="text-sm muted">Sin cuenta, tus datos solo se guardan en este dispositivo. Exporta una copia para no perderlos o pasarlos a otro móvil.</p>
        <button className="btn btn-ghost" onClick={backup}>Exportar copia</button>
        <button className="btn btn-ghost" onClick={() => file.current?.click()}>Restaurar copia…</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => restore(e.target.files?.[0])} />
        <button className="text-sm muted underline" onClick={clearHistory}>Borrar historial de consultas</button>
      </section>

      {MONEY.supportUrl && (
        <section className="card p-4 space-y-2">
          <h2 className="font-semibold">Apoya Foilio</h2>
          <p className="text-sm muted">Foilio es gratis y sin anuncios. Si te resulta útil, puedes ayudar a mantenerla.</p>
          <a className="btn" href={MONEY.supportUrl} target="_blank" rel="noopener noreferrer">Invítame a un café ☕</a>
        </section>
      )}

      <section className="text-xs muted space-y-1">
        <p>Datos de cartas y precios: <a className="underline" href="https://rifthunt.com" target="_blank" rel="noopener noreferrer">RiftHunt</a> (precios de TCGplayer). Tipo de cambio: Banco Central Europeo vía Frankfurter.</p>
        {HAS_AFFILIATES && <p>Algunos enlaces a tiendas son de afiliado: si compras a través de ellos, Foilio recibe una pequeña comisión sin coste para ti.</p>}
        <p>Foilio no está afiliada a Riot Games. Riftbound es una marca de Riot Games.</p>
      </section>
    </div>
  )
}
