import { Link } from 'react-router-dom'
import { type Card, usdPrices } from '../lib'

export default function CardRow({ card }: { card: Card }) {
  const price = usdPrices(card)[0]
  return (
    <Link to={`/carta/${card.id}`} className="card flex items-center gap-3 p-3">
      <img src={card.images?.thumb} alt="" loading="lazy" className="w-14 rounded-lg" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{card.name}</p>
        <p className="text-sm muted">{card.set_name} · {card.collector_number} · {card.rarity}</p>
      </div>
      {price && <p className="font-semibold" style={{ color: 'var(--gold)' }}>${price.usd.toFixed(2)}</p>}
    </Link>
  )
}
