import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addHistory, addOwned, addToDeck, baseName, cardmarketSearchUrl, cardmarketUrl, collectorNo, db, es, finishList,
  toggleFav, type FinishName,
} from '../lib'
import { useCatalog, useToast } from '../state'
import CardRow from '../components/CardRow'
import Icon from '../components/Icon'
import { DomainChip, RulesText, Sparkline, Stepper } from '../components/bits'

/** La clave reinicia el estado (acabado elegido, menú de mazos) al saltar a otra versión de la carta. */
export default function CardRoute() {
  const { id = '' } = useParams()
  return <CardPage key={id} id={id} />
}

function CardPage({ id }: { id: string }) {
  const nav = useNavigate()
  const toast = useToast()
  const { cards, byId, priceOf, money, rate, currency } = useCatalog()
  const card = byId.get(id)
  const price = priceOf(card)
  const fav = useLiveQuery(() => db.favs.get(id), [id])
  const owned = useLiveQuery(() => db.collection.where('cardId').equals(id).toArray(), [id])
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const hist = useLiveQuery(() => card?.tcgId ? db.priceHist.where('tcgId').equals(card.tcgId).sortBy('day') : [], [card?.tcgId])
  const [pick, setPick] = useState('')
  const [deckOpen, setDeckOpen] = useState(false)
  const others = useMemo(() => card ? cards.filter(c => c.id !== card.id && baseName(c) === baseName(card)) : [], [cards, card])

  useEffect(() => { if (card) addHistory(card.id) }, [card?.id])

  if (!card) return (
    <div className="card p-4 space-y-3"><p>Carta no encontrada.</p><button className="btn" onClick={() => nav('/buscar')}>Buscar cartas</button></div>
  )

  const finishes = finishList(price)
  const sel = finishes.find(([n]) => n === pick) ?? finishes[0] // normal por defecto; si solo hay foil, foil
  const foil = sel?.[0] === 'foil'
  const points = (hist ?? []).map(h => h[(sel?.[0] ?? 'normal') as FinishName]).filter((v): v is number => v != null)
  if (sel?.[1].market != null && points[points.length - 1] !== sel[1].market) points.push(sel[1].market)
  const change = points.length >= 2 ? (points[points.length - 1] - points[0]) / points[0] : null
  // Se puede tener en colección cualquier acabado con precio; si no hay datos, ambos.
  const ownFinishes: FinishName[] = finishes.length ? finishes.map(([n]) => n as FinishName).filter(n => n === 'normal' || n === 'foil') : ['normal', 'foil']
  const qtyOf = (f: FinishName) => owned?.find(o => o.finish === f)?.qty ?? 0

  async function onFav() {
    const now = await toggleFav(card!.id)
    toast(now ? 'Añadida a favoritos' : 'Quitada de favoritos')
  }
  async function onDeck(deckId: number, name: string) {
    const err = await addToDeck(deckId, card!)
    toast(err ?? `Añadida a «${name}»`, err ? undefined : { label: 'Ver mazo', run: () => nav(`/mazos/${deckId}`) })
    if (!err) setDeckOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => (history.state?.idx > 0 ? nav(-1) : nav('/'))} className="p-2 -ml-2 muted" aria-label="Volver"><Icon name="back" className="w-6 h-6" /></button>
        <button onClick={onFav} aria-pressed={!!fav} aria-label={fav ? 'Quitar de favoritos' : 'Añadir a favoritos'} className={`p-2 -mr-2 ${fav ? 'gold' : 'muted'}`}>
          <Icon name="star" filled={!!fav} className="w-7 h-7" />
        </button>
      </div>
      <img src={card.imgUrl} alt={card.name}
        className={`mx-auto rounded-2xl shadow-lg ${card.orientation === 'landscape' ? 'w-full aspect-[7/5]' : 'w-3/4 aspect-[5/7]'} object-cover bg-black/10`} />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{card.name}</h1>
        <p className="muted text-sm">
          {es(card.rarity)} · {card.setName} · Nº {collectorNo(card)} · {es(card.type)}{card.supertype && ` · ${es(card.supertype)}`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {card.domains?.map(d => <DomainChip key={d} d={d} />)}
          {card.energy != null && <span className="chip">Energía {card.energy}</span>}
          {card.power != null && <span className="chip">Poder {card.power}</span>}
          {card.might != null && <span className="chip">Poderío {card.might}</span>}
        </div>
      </div>

      <section className="card p-4 space-y-3" aria-label="Precio">
        <h2 className="font-semibold">Precio estimado</h2>
        {sel ? (
          <>
            {finishes.length > 1 && (
              <div className="flex gap-2">
                {finishes.map(([n]) => (
                  <button key={n} onClick={() => setPick(n)} aria-pressed={sel[0] === n}
                    className={`px-3 py-1 rounded-full text-sm ${sel[0] === n ? 'bg-[var(--rift)] text-white' : 'chip'}`}>{es(n)}</button>
                ))}
              </div>
            )}
            <div className="flex items-baseline gap-3">
              <p className="text-3xl font-bold gold">{money(sel[1].market)}</p>
              {change != null && Math.abs(change) >= 0.005 && (
                <span className={`text-sm font-semibold ${change > 0 ? 'teal' : 'text-[#e5484d]'}`}>{change > 0 ? '▲' : '▼'} {Math.abs(change * 100).toFixed(1)} %</span>
              )}
              {finishes.length === 1 && <span className="chip">{es(sel[0])}</span>}
            </div>
            <p className="text-sm muted">Mín. {money(sel[1].low)} · Medio {money(sel[1].mid)} · Máx. {money(sel[1].high)}</p>
            <Sparkline points={points} />
          </>
        ) : <p className="muted">Esta carta no tiene precio disponible ahora mismo.</p>}
        <a href={cardmarketUrl(card, foil)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
          Ver en Cardmarket{foil ? ' (foil)' : ''} <Icon name="external" className="w-4 h-4" />
        </a>
        <div className="flex justify-between text-xs muted">
          <a href={cardmarketSearchUrl(card, foil)} target="_blank" rel="noopener noreferrer" className="underline">¿No es esta? Buscar en Cardmarket</a>
          {price?.purchaseUri && <a href={price.purchaseUri} target="_blank" rel="noopener noreferrer sponsored" className="underline">Ver en TCGplayer</a>}
        </div>
        {price && <p className="text-xs muted">
          Precio de mercado de TCGplayer en USD{currency === 'EUR' && rate ? `, convertido con el tipo del BCE (1 USD = ${rate.toFixed(4)} €)` : ''}.
          {' '}Actualizado: {new Date(price.updatedAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}. Orientativo.
        </p>}
      </section>

      <section className="card p-4 space-y-3" aria-label="Mi colección">
        <h2 className="font-semibold">En mi colección</h2>
        {ownFinishes.map(f => (
          <div key={f} className="flex items-center justify-between">
            <span>{es(f)}</span>
            <Stepper label={es(f)} value={qtyOf(f)} onChange={d => addOwned(card.id, f, d)} />
          </div>
        ))}
      </section>

      <button className="btn" aria-expanded={deckOpen} onClick={() => setDeckOpen(!deckOpen)}>Añadir a un mazo</button>
      {deckOpen && (
        <div className="card p-3 space-y-2">
          {decks?.map(d => <button key={d.id} className="btn btn-ghost" onClick={() => onDeck(d.id!, d.name)}>{d.name}</button>)}
          {!decks?.length && <p className="text-sm muted">Aún no tienes mazos. Crea uno en la pestaña Mazos.</p>}
        </div>
      )}

      {(card.text || card.flavour) && (
        <section className="card p-4 space-y-2 text-sm" aria-label="Texto">
          <RulesText card={card} />
          {card.flavour && <p className="italic muted">{card.flavour}</p>}
        </section>
      )}
      <p className="text-xs muted">
        {card.tags?.length ? <>Etiquetas: {card.tags.join(', ')}. </> : null}
        {card.artist && <>Ilustración: {card.artist}.</>}
      </p>

      {others.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Otras versiones</h2>
          {others.map(c => <CardRow key={c.id} card={c} />)}
        </section>
      )}
    </div>
  )
}
