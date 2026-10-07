import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, finishList, money, thumbUrl, type Card } from '../lib'

export default function CardRow({ card }: { card: Card }) {
  const p = useLiveQuery(() => db.prices.get(card.riftboundId), [card.riftboundId])
  const best = p ? finishList(p)[0] : undefined
  return (
    <Link to={`/carta/${card.id}`} className="card flex items-center gap-3 p-3">
      <img src={thumbUrl(card.imgUrl)} alt="" loading="lazy" decoding="async" width={56} height={78}
        onError={e => { const i = e.currentTarget; if (i.src !== card.imgUrl) i.src = card.imgUrl }}
        className="w-14 aspect-[5/7] object-cover rounded-lg bg-black/10" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{card.name}</p>
        <p className="text-sm muted">{card.setName} · {card.riftboundId.split('-')[1]} · {card.rarity}</p>
      </div>
      {best && <p className="font-semibold" style={{ color: 'var(--gold)' }}>{money(best[1].market)}</p>}
    </Link>
  )
}