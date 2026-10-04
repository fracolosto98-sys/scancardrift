import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib'
import CardRow from './CardRow'

export default function Home() {
  const recent = useLiveQuery(async () => {
    const h = await db.history.orderBy('ts').reverse().limit(30).toArray()
    const ids = [...new Set(h.map(x => x.id))].slice(0, 5)
    return (await db.cards.bulkGet(ids)).filter(Boolean) as import('../lib').Card[]
  }, [])
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold pt-4">ScanCard</h1>
      <p className="muted">Apunta a una carta de Riftbound y consulta su precio.</p>
      <Link to="/escanear" className="btn block text-center text-lg py-6">Escanear carta</Link>
      <Link to="/buscar" className="btn btn-ghost block text-center">Buscar carta</Link>
      <h2 className="font-semibold pt-2">Últimas cartas consultadas</h2>
      {recent?.length ? recent.map(c => <CardRow key={c.id} card={c} />)
        : <p className="muted">Aún no has consultado ninguna carta. Escanea la primera.</p>}
    </div>
  )
}
