import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { collectorNo, es, finishList, thumbUrl, type Card } from '../lib'
import { useCatalog } from '../state'

export function CardImg({ card, w = 200, className = '' }: { card: Card; w?: 200 | 400; className?: string }) {
  return (
    <img src={thumbUrl(card.imgUrl, w)} alt="" loading="lazy" decoding="async"
      onError={e => { const i = e.currentTarget; if (i.src !== card.imgUrl) i.src = card.imgUrl }}
      className={`object-cover bg-black/10 ${card.orientation === 'landscape' ? 'aspect-[7/5]' : 'aspect-[5/7]'} ${className}`} />
  )
}

/** Fila de carta con miniatura y precio. `right` sustituye al precio (p. ej. cantidad en la colección). */
export default function CardRow({ card, right, sub }: { card: Card; right?: ReactNode; sub?: ReactNode }) {
  const { priceOf, money } = useCatalog()
  const best = finishList(priceOf(card))[0]
  return (
    <Link to={`/carta/${card.id}`} className="card flex items-center gap-3 p-3">
      <CardImg card={card} className="w-14 rounded-lg shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{card.name}</p>
        <p className="text-sm muted truncate">{sub ?? <>{card.setName} · {collectorNo(card)} · {es(card.rarity)}</>}</p>
      </div>
      {right ?? (best && (
        <p className="font-semibold text-right gold">
          {money(best[1].market)}
          {best[0] !== 'normal' && <span className="block text-[10px] uppercase tracking-wide muted">{es(best[0])}</span>}
        </p>
      ))}
    </Link>
  )
}
