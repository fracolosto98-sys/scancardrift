import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addToDeck, baseName, cardPrice, db, money, zoneOf, type Card, type Zone } from '../lib'

async function load(id: number) {
  const rows = await db.deckCards.where('deckId').equals(id).toArray()
  const cards = await db.cards.bulkGet(rows.map(r => r.cardId))
  const prices = await db.prices.bulkGet(cards.map(c => c?.riftboundId ?? ''))
  const items = rows.flatMap((r, i) => cards[i] ? [{ qty: r.qty, card: cards[i]!, price: prices[i] ? cardPrice(prices[i]!) : null }] : [])
  const by = (z: Zone) => items.filter(x => zoneOf(x.card) === z).sort((a, b) => a.card.name.localeCompare(b.card.name))
  const n = (z: Zone) => by(z).reduce((s, x) => s + x.qty, 0)
  return {
    legend: by('legend')[0]?.card, main: by('main'), runes: by('runes'), bf: by('battlefields'),
    counts: { main: n('main'), runes: n('runes'), bf: n('battlefields') },
    total: items.reduce((s, x) => s + x.qty * (x.price ?? 0), 0),
    unpriced: items.filter(x => x.price == null).length,
  }
}

export default function Decks() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const decks = useLiveQuery(async () => Promise.all((await db.decks.toArray()).map(async d => ({ d, s: await load(d.id!) }))), [])
  async function create() {
    const n = name.trim(); if (!n) return
    const id = await db.decks.add({ name: n, createdAt: Date.now() }); setName(''); nav(`/mazos/${id}`)
  }
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold pt-2">Mazos</h1>
      <div className="flex gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del mazo" aria-label="Nombre del mazo" className="card flex-1 p-3 outline-none" />
        <button className="btn !w-auto" onClick={create}>Crear</button>
      </div>
      {decks?.length === 0 && <p className="muted">Crea tu primer mazo, elige una Leyenda y ve añadiendo cartas desde su ficha.</p>}
      {decks?.map(({ d, s }) => (
        <Link key={d.id} to={`/mazos/${d.id}`} className="card flex items-center gap-3 p-3">
          {s.legend ? <img src={s.legend.imgUrl} alt="" className="w-14 rounded-lg" /> : <div className="w-14 h-20 rounded-lg bg-black/10" />}
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{d.name}</p>
            <p className="text-sm muted">{s.legend?.name ?? 'Sin leyenda'} · {s.counts.main}/40 cartas</p>
          </div>
          <b style={{ color: 'var(--gold)' }}>{money(s.total)}</b>
        </Link>
      ))}
    </div>
  )
}

type Item = { qty: number; card: Card; price: number | null }

function Zone({ title, items, need, count, legend, onChange }: {
  title: string; items: Item[]; need: number; count: number; legend?: Card; onChange: (c: Card, d: 1 | -1) => void
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title} <span className={count === need ? 'text-[var(--teal)]' : 'muted'}>{count}/{need}</span></h2>
      {items.length === 0 && <p className="text-sm muted">Vacío.</p>}
      <div className="grid grid-cols-3 gap-2">
        {items.map(({ qty, card }) => {
          const off = legend && card.domains?.some(d => !legend.domains?.includes(d))
          return (
            <div key={card.id} className="card p-1 text-center">
              <Link to={`/carta/${card.id}`}><img src={card.imgUrl} alt={baseName(card)} loading="lazy" className="rounded-lg w-full" /></Link>
              <p className="text-xs truncate mt-1">{off && '⚠️ '}{baseName(card)}</p>
              <div className="flex items-center justify-between text-sm px-1">
                <button aria-label="Quitar una" onClick={() => onChange(card, -1)} className="px-2">−</button>
                <b>{qty}</b>
                <button aria-label="Añadir una" onClick={() => onChange(card, 1)} className="px-2">+</button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function DeckPage() {
  const nav = useNavigate()
  const id = Number(useParams().id)
  const deck = useLiveQuery(() => db.decks.get(id), [id])
  const s = useLiveQuery(() => load(id), [id])
  const [msg, setMsg] = useState('')
  if (!deck || !s) return <p className="muted">Cargando…</p>

  const ok = !!s.legend && s.counts.main >= 40 && s.counts.runes === 12 && s.counts.bf === 3
  async function change(c: Card, d: 1 | -1) {
    setMsg('')
    if (d === 1) return setMsg((await addToDeck(id, c)) ?? '')
    const cur = await db.deckCards.get([id, c.id])
    if (cur && cur.qty > 1) await db.deckCards.put({ ...cur, qty: cur.qty - 1 })
    else await db.deckCards.delete([id, c.id])
  }
  async function remove() {
    if (!confirm(`¿Eliminar el mazo «${deck!.name}»?`)) return
    await db.transaction('rw', db.decks, db.deckCards, async () => {
      await db.deckCards.where('deckId').equals(id).delete(); await db.decks.delete(id)
    })
    nav('/mazos')
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center pt-2">
        <h1 className="text-2xl font-bold truncate">{deck.name}</h1>
        <button className="text-sm muted underline" onClick={() => { const n = prompt('Nuevo nombre', deck.name)?.trim(); if (n) db.decks.update(id, { name: n }) }}>Renombrar</button>
      </div>
      <div className="card p-4 flex gap-3 items-center">
        {s.legend ? <img src={s.legend.imgUrl} alt={s.legend.name} className="w-20 rounded-lg" /> : <div className="w-20 h-28 rounded-lg bg-black/10" />}
        <div className="flex-1">
          <p className="font-semibold">{s.legend?.name ?? 'Sin leyenda'}</p>
          <p className="text-sm muted">{s.legend?.domains?.join(' · ') ?? 'Guarda una carta de tipo Legend en este mazo'}</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--gold)' }}>{money(s.total)}</p>
          {s.unpriced > 0 && <p className="text-xs muted">{s.unpriced} carta(s) sin precio no suman.</p>}
        </div>
      </div>
      <p role="status" className={`text-sm ${ok ? 'text-[var(--teal)]' : 'muted'}`}>
        {ok ? '✅ Mazo completo y válido' : 'Pendiente: leyenda, 40+ cartas, 12 runas y 3 campos de batalla distintos.'}
      </p>
      {msg && <p role="alert" className="text-sm text-[var(--gold)]">{msg}</p>}
      <Link to="/buscar" className="btn btn-ghost block text-center">Buscar cartas para añadir</Link>
      <Zone title="Mazo principal" items={s.main} need={40} count={s.counts.main} legend={s.legend} onChange={change} />
      <Zone title="Runas" items={s.runes} need={12} count={s.counts.runes} legend={s.legend} onChange={change} />
      <Zone title="Campos de batalla" items={s.bf} need={3} count={s.counts.bf} onChange={change} />
      <p className="text-xs muted">⚠️ = la carta tiene un dominio que no pertenece a la identidad de la leyenda.</p>
      <button className="btn btn-ghost" onClick={remove}>Eliminar mazo</button>
    </div>
  )
}