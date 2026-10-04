import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Card } from '../lib'
import CardRow from './CardRow'

export default function Favorites() {
  const cards = useLiveQuery(async () => {
    const ids = (await db.favs.toArray()).map(f => f.id)
    return (await db.cards.bulkGet(ids)).filter(Boolean) as Card[]
  }, [])
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold pt-2">Favoritos</h1>
      {cards?.length === 0 && <p className="muted">Todavía no tienes favoritos. Abre una carta y pulsa «Añadir a favoritos».</p>}
      {cards?.map(c => <CardRow key={c.id} card={c} />)}
    </div>
  )
}
