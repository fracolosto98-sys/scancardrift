import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, finishList, money } from '../lib'

export default function CardPage() {
  const { id = '' } = useParams()
  const card = useLiveQuery(() => db.cards.get(id), [id])
  const fav = useLiveQuery(() => db.favs.get(id), [id])
  const price = useLiveQuery(async () => {
    const c = await db.cards.get(id)
    return c ? db.prices.get(c.riftboundId) : undefined
  }, [id])
  useEffect(() => { if (id) db.history.add({ id, ts: Date.now() }) }, [id])

  if (card === undefined) return <p className="muted">Cargando…</p>
  if (!card) return <p>Carta no encontrada.</p>
  const finishes = price ? finishList(price) : []
  return (
    <div className="space-y-4">
      <img src={card.imgUrl} alt={card.name} className="w-3/4 mx-auto rounded-2xl shadow-lg" />
      <h1 className="text-2xl font-bold">{card.name}</h1>
      <p className="muted">{card.rarity} · {card.setName} · Nº {card.riftboundId.split('-')[1]} · {card.type}{card.energy != null && ` · Coste ${card.energy}`}</p>
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold">Precio actual (TCGplayer, USD)</h2>
        {finishes.length ? finishes.map(([name, f]) => (
          <div key={name}>
            <p className="flex justify-between"><span className="capitalize">{name}</span>
              <b style={{ color: 'var(--gold)' }}>{money(f.market)}</b></p>
            <p className="text-sm muted">Mín. {money(f.low)} · Medio {money(f.mid)} · Máx. {money(f.high)}</p>
          </div>
        )) : <p className="muted">Esta carta no tiene precio disponible ahora mismo.</p>}
        {price && <p className="text-xs muted">Actualizado: {new Date(price.updatedAt).toLocaleString('es-ES')}. Estimación orientativa.</p>}
      </div>
      <button className="btn" onClick={() => fav ? db.favs.delete(id) : db.favs.put({ id })}>
        {fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      </button>
    </div>
  )
}