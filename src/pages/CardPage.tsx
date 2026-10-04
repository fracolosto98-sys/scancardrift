import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, usdPrices } from '../lib'

export default function CardPage() {
  const { id = '' } = useParams()
  const card = useLiveQuery(() => db.cards.get(id), [id])
  const fav = useLiveQuery(() => db.favs.get(id), [id])
  useEffect(() => { if (id) db.history.add({ id, ts: Date.now() }) }, [id])
  if (card === undefined) return <p className="muted">Cargando…</p>
  if (!card) return <p>Carta no encontrada.</p>
  const prices = usdPrices(card)
  return (
    <div className="space-y-4">
      <img src={card.images?.full} alt={card.name} className="w-3/4 mx-auto rounded-2xl shadow-lg" />
      <h1 className="text-2xl font-bold">{card.name}</h1>
      <p className="muted">{card.rarity} · {card.set_name} · Nº {card.collector_number} · {card.type}{card.energy != null && ` · Coste ${card.energy}`}</p>
      <div className="card p-4">
        <h2 className="font-semibold mb-2">Precio actual (TCGplayer, USD)</h2>
        {prices.length ? prices.map(p => (
          <p key={p.finish} className="flex justify-between"><span className="capitalize">{p.finish}</span><b>${p.usd.toFixed(2)}</b></p>
        )) : <p className="muted">Esta carta no tiene precio disponible ahora mismo.</p>}
        <p className="text-xs muted mt-2">Estimación diaria, solo orientativa.</p>
      </div>
      <button className="btn" onClick={() => fav ? db.favs.delete(id) : db.favs.put({ id })}>
        {fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      </button>
    </div>
  )
}
