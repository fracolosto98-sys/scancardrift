import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib'
import CardRow from './CardRow'

export default function Search() {
  const [q, setQ] = useState('')
  const [rarity, setRarity] = useState('')
  const results = useLiveQuery(async () => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    return db.cards.filter(c => c.name.toLowerCase().includes(t) && (!rarity || c.rarity === rarity)).limit(40).toArray()
  }, [q, rarity])
  return (
    <div className="space-y-3">
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar carta, p. ej. Jinx"
        aria-label="Buscar carta" className="card w-full p-4 outline-none" />
      <select value={rarity} onChange={e => setRarity(e.target.value)} aria-label="Rareza" className="card w-full p-3">
        <option value="">Todas las rarezas</option>
        {['common', 'uncommon', 'rare', 'epic', 'showcase', 'promo'].map(r => <option key={r}>{r}</option>)}
      </select>
      {q.trim().length >= 2 && results?.length === 0 && <p className="muted">Sin resultados para «{q}».</p>}
      {results?.map(c => <CardRow key={c.id} card={c} />)}
    </div>
  )
}
