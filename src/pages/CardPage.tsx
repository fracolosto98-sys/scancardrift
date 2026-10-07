import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addToDeck, db, cardmarketUrl, cardmarketSearchUrl, finishList, getRate, money } from '../lib'

export default function CardPage() {
  const { id = '' } = useParams()
  const card = useLiveQuery(() => db.cards.get(id), [id])
  const fav = useLiveQuery(() => db.favs.get(id), [id])
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const price = useLiveQuery(async () => {
    const c = await db.cards.get(id)
    return c ? db.prices.get(c.riftboundId) : undefined
  }, [id])
  const [pick, setPick] = useState('')
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { if (id) db.history.add({ id, ts: Date.now() }) }, [id])

  if (card === undefined) return <p className="muted">Cargando…</p>
  if (!card) return <p>Carta no encontrada.</p>
  const finishes = price ? finishList(price) : []
  const sel = finishes.find(([n]) => n === pick) ?? finishes[0] // normal por defecto; si solo hay foil, foil

  async function saveTo(target: 'fav' | number) {
    if (target === 'fav') { await (fav ? db.favs.delete(id) : db.favs.put({ id })); setMsg(fav ? 'Quitada de favoritos' : 'Guardada en Favoritos') }
    else { const err = await addToDeck(target, card!); setMsg(err ?? 'Añadida al mazo') }
    setOpen(false)
  }

  return (
    <div className="space-y-4">
      <img src={card.imgUrl} alt={card.name} className="w-3/4 mx-auto rounded-2xl shadow-lg" />
      <h1 className="text-2xl font-bold">{card.name}</h1>
      <p className="muted">{card.rarity} · {card.setName} · Nº {card.riftboundId.split('-')[1]} · {card.type}{card.energy != null && ` · Coste ${card.energy}`}</p>
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold">Precio estimado</h2>
        {sel ? (
          <>
            <div className="flex gap-2">
              {finishes.map(([n]) => (
                <button key={n} onClick={() => setPick(n)} aria-pressed={sel[0] === n}
                  className={`px-3 py-1 rounded-full text-sm capitalize ${sel[0] === n ? 'bg-[var(--rift)] text-white' : 'card'}`}>{n}</button>
              ))}
            </div>
            <p className="text-3xl font-bold" style={{ color: 'var(--gold)' }}>{money(sel[1].market)}</p>
            <p className="text-sm muted">Mín. {money(sel[1].low)} · Medio {money(sel[1].mid)} · Máx. {money(sel[1].high)}</p>
          </>
        ) : <p className="muted">Esta carta no tiene precio disponible ahora mismo.</p>}
            <a
                href={cardmarketUrl(card, sel?.[0] === 'foil')}
                target="_blank" rel="noopener noreferrer"
                className="btn btn-ghost block text-center"
              >
                Ver en Cardmarket{sel?.[0] === 'foil' ? ' (foil)' : ''} ↗
              </a>
              <a
                href={cardmarketSearchUrl(card, sel?.[0] === 'foil')}
                target="_blank" rel="noopener noreferrer"
                className="block text-center text-xs muted underline"
              >
                ¿No es esta carta? Buscar en Cardmarket
              </a>
       {price && <p className="text-xs muted">
          Precio de TCGplayer (USD){getRate() ? `, convertido con el tipo del BCE (1 USD = ${getRate()!.toFixed(4)} €)` : ''}. Actualizado: {new Date(price.updatedAt).toLocaleString('es-ES')}. Orientativo.
        </p>}
      </div>
      <button className="btn" onClick={() => setOpen(!open)}>Guardar en…</button>
      {open && (
        <div className="card p-3 space-y-2">
          <button className="btn btn-ghost" onClick={() => saveTo('fav')}>{fav ? '⭐ Quitar de Favoritos' : '⭐ Favoritos'}</button>
          {decks?.map(d => <button key={d.id} className="btn btn-ghost" onClick={() => saveTo(d.id!)}>🃏 {d.name}</button>)}
          {!decks?.length && <p className="text-sm muted">Aún no tienes mazos. Crea uno en la pestaña Mazos.</p>}
        </div>
      )}
      {msg && <p role="status" className="text-center text-sm">{msg}</p>}
    </div>
  )
}