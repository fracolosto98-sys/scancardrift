import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, finishPrice } from '../lib'
import { useCards, useCatalog } from '../state'
import CardRow from '../components/CardRow'
import Icon from '../components/Icon'

export default function Home() {
  const { byId, priceOf, money } = useCatalog()
  const recentIds = useLiveQuery(async () => {
    const h = await db.history.orderBy('ts').reverse().limit(30).toArray()
    return [...new Set(h.map(x => x.id))].slice(0, 5)
  }, [])
  const recent = useCards(recentIds)
  const owned = useLiveQuery(() => db.collection.toArray(), [])
  const copies = owned?.reduce((s, o) => s + o.qty, 0) ?? 0
  const value = owned?.reduce((s, o) => s + o.qty * (finishPrice(priceOf(byId.get(o.cardId)), o.finish) ?? 0), 0) ?? 0

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-4">
        <h1 className="text-3xl font-bold">Foilio</h1>
        <Link to="/ajustes" aria-label="Ajustes" className="p-2 muted"><Icon name="gear" className="w-6 h-6" /></Link>
      </header>
      <p className="muted">Apunta a una carta de Riftbound y consulta su precio.</p>
      <Link to="/escanear" className="btn text-lg py-6"><Icon name="scan" className="w-6 h-6" />Escanear carta</Link>
      <Link to="/buscar" className="btn btn-ghost"><Icon name="search" />Buscar carta</Link>
      {copies > 0 && (
        <Link to="/coleccion" className="card p-4 flex items-center justify-between">
          <div>
            <p className="text-sm muted">Mi colección</p>
            <p className="font-semibold">{copies} {copies === 1 ? 'carta' : 'cartas'}</p>
          </div>
          <p className="text-2xl font-bold gold">{money(value)}</p>
        </Link>
      )}
      <h2 className="font-semibold pt-2">Últimas cartas consultadas</h2>
      {recent?.length ? recent.map(c => <CardRow key={c.id} card={c} />)
        : <p className="muted">Aún no has consultado ninguna carta. Escanea la primera.</p>}
    </div>
  )
}
