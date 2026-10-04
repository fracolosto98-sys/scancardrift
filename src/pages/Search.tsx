import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, cardPrice, type Card } from '../lib'
import CardRow from './CardRow'

const SORTS = {
  'price-desc': 'Precio: mayor a menor',
  'price-asc': 'Precio: menor a mayor',
  name: 'Nombre A–Z',
  number: 'Número de colección',
} as const
type Sort = keyof typeof SORTS
const uniq = (a: (string | undefined)[]) => [...new Set(a.filter(Boolean) as string[])].sort()

function Sel({ value, onChange, label, options }: {
  value: string; onChange: (v: string) => void; label: string; options: [string, string][]
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} className="card w-full p-3 text-sm">
      <option value="">{label}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

export default function Search() {
  const [q, setQ] = useState('')
  const [set, setSet] = useState('')
  const [rarity, setRarity] = useState('')
  const [type, setType] = useState('')
  const [domain, setDomain] = useState('')
  const [onlyPriced, setOnlyPriced] = useState(false)
  const [sort, setSort] = useState<Sort>('price-desc')
  const [limit, setLimit] = useState(60)

  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const prices = useLiveQuery(
    async () => new Map((await db.prices.toArray()).map(p => [p.riftboundId, cardPrice(p)] as const)), [])

  const sets = useMemo(
    () => [...new Map((cards ?? []).map(c => [c.set, c.setName] as const)).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [cards])
  const rarities = useMemo(() => uniq((cards ?? []).map(c => c.rarity)), [cards])
  const types = useMemo(() => uniq((cards ?? []).map(c => c.type)), [cards])
  const domains = useMemo(() => uniq((cards ?? []).flatMap(c => c.domains ?? [])), [cards])

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    const price = (c: Card) => prices?.get(c.riftboundId) ?? null
    return (cards ?? [])
      .filter(c =>
        (!t || c.name.toLowerCase().includes(t)) &&
        (!set || c.set === set) && (!rarity || c.rarity === rarity) &&
        (!type || c.type === type) && (!domain || c.domains?.includes(domain)) &&
        (!onlyPriced || price(c) != null))
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name)
        if (sort === 'number') return a.riftboundId.localeCompare(b.riftboundId, undefined, { numeric: true })
        const pa = price(a), pb = price(b)
        if (pa == null && pb == null) return 0
        if (pa == null) return 1
        if (pb == null) return -1
        return sort === 'price-desc' ? pb - pa : pa - pb
      })
  }, [cards, prices, q, set, rarity, type, domain, onlyPriced, sort])

  return (
    <div className="space-y-3">
      <input value={q} onChange={e => { setQ(e.target.value); setLimit(60) }} placeholder="Buscar carta, p. ej. Jinx"
        aria-label="Buscar carta" className="card w-full p-4 outline-none" />
      <div className="grid grid-cols-2 gap-2">
        <Sel value={set} onChange={setSet} label="Colección" options={sets} />
        <Sel value={rarity} onChange={setRarity} label="Rareza" options={rarities.map(r => [r, r])} />
        <Sel value={type} onChange={setType} label="Tipo" options={types.map(t => [t, t])} />
        <Sel value={domain} onChange={setDomain} label="Dominio" options={domains.map(d => [d, d])} />
      </div>
      <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Ordenar por" className="card w-full p-3 text-sm">
        {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyPriced} onChange={e => setOnlyPriced(e.target.checked)} /> Solo cartas con precio
      </label>
      <p className="text-sm muted">{results.length} cartas</p>
      {cards && results.length === 0 && <p className="muted">Sin resultados. Prueba a quitar algún filtro.</p>}
      {results.slice(0, limit).map(c => <CardRow key={c.id} card={c} />)}
      {results.length > limit && <button className="btn btn-ghost" onClick={() => setLimit(limit + 60)}>Mostrar más</button>}
    </div>
  )
}