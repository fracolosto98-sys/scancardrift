import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { cardPrice, es, norm, type Card } from '../lib'
import { useCatalog } from '../state'
import CardRow from '../components/CardRow'

const SORTS = {
  'price-desc': 'Precio: mayor a menor',
  'price-asc': 'Precio: menor a mayor',
  name: 'Nombre A–Z',
  number: 'Número de colección',
  energy: 'Coste de energía',
} as const
type Sort = keyof typeof SORTS
const PAGE = 30
const uniq = (a: (string | null | undefined)[]) => [...new Set(a.filter(Boolean) as string[])].sort()

function Sel({ value, onChange, label, options }: {
  value: string; onChange: (v: string) => void; label: string; options: [string, string][]
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} className="field text-sm">
      <option value="">{label}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

export default function Search() {
  const { cards, priceOf } = useCatalog()
  // Los filtros viven en la URL: al abrir una carta y volver atrás siguen ahí.
  const [params, setParams] = useSearchParams()
  const get = (k: string) => params.get(k) ?? ''
  const set = (k: string, v: string) => setParams(p => { if (v) p.set(k, v); else p.delete(k); return p }, { replace: true })
  const [q, setQ] = useState(get('q'))
  const [limit, setLimit] = useState(PAGE)
  const sort = (get('orden') || 'price-desc') as Sort
  const inText = get('texto') === '1'
  const f = { set: get('set'), rarity: get('rareza'), type: get('tipo'), domain: get('dominio'), priced: get('precio') === '1' }

  const sets = useMemo(
    () => [...new Map(cards.map(c => [c.set, c.setName] as const)).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [cards])
  const rarities = useMemo(() => uniq(cards.map(c => c.rarity)), [cards])
  const types = useMemo(() => uniq(cards.map(c => c.type)), [cards])
  const domains = useMemo(() => uniq(cards.flatMap(c => c.domains ?? [])), [cards])
  const hay = useMemo(() => new Map(cards.map(c => [c, {
    base: norm(c.name) + ' ' + norm(c.riftboundId) + ' ' + (c.tags ?? []).map(norm).join(' '),
    text: norm(c.text ?? ''),
  }])), [cards])

  const results = useMemo(() => {
    const words = q.trim().split(/\s+/).map(norm).filter(Boolean)
    const price = (c: Card) => cardPrice(priceOf(c))
    return cards
      .filter(c => {
        const h = hay.get(c)!
        return words.every(w => h.base.includes(w) || (inText && h.text.includes(w))) &&
          (!f.set || c.set === f.set) && (!f.rarity || c.rarity === f.rarity) &&
          (!f.type || c.type === f.type) && (!f.domain || c.domains?.includes(f.domain)) &&
          (!f.priced || price(c) != null)
      })
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name)
        if (sort === 'number') return a.riftboundId.localeCompare(b.riftboundId, undefined, { numeric: true })
        if (sort === 'energy') return (a.energy ?? 99) - (b.energy ?? 99) || a.name.localeCompare(b.name)
        const pa = price(a), pb = price(b)
        if (pa == null || pb == null) return pa == null ? (pb == null ? 0 : 1) : -1
        return sort === 'price-desc' ? pb - pa : pa - pb
      })
  }, [cards, hay, priceOf, q, inText, f.set, f.rarity, f.type, f.domain, f.priced, sort])

  const active = [f.set, f.rarity, f.type, f.domain, f.priced, inText].filter(Boolean).length
  return (
    <div className="space-y-3">
      <input type="search" value={q} placeholder="Nombre, número (030) o etiqueta…" aria-label="Buscar carta" className="field p-4"
        onChange={e => { setQ(e.target.value); set('q', e.target.value); setLimit(PAGE) }} />
      <div className="grid grid-cols-2 gap-2">
        <Sel value={f.set} onChange={v => set('set', v)} label="Colección" options={sets} />
        <Sel value={f.rarity} onChange={v => set('rareza', v)} label="Rareza" options={rarities.map(r => [r, es(r)])} />
        <Sel value={f.type} onChange={v => set('tipo', v)} label="Tipo" options={types.map(t => [t, es(t)])} />
        <Sel value={f.domain} onChange={v => set('dominio', v)} label="Dominio" options={domains.map(d => [d, es(d)])} />
      </div>
      <select value={sort} onChange={e => set('orden', e.target.value)} aria-label="Ordenar por" className="field text-sm">
        {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.priced} onChange={e => set('precio', e.target.checked ? '1' : '')} /> Solo con precio</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={inText} onChange={e => set('texto', e.target.checked ? '1' : '')} /> Buscar también en el texto</label>
      </div>
      <div className="flex justify-between items-center text-sm muted">
        <p>{results.length} cartas</p>
        {(active > 0 || q) && <button className="underline" onClick={() => { setQ(''); setParams({}, { replace: true }) }}>Limpiar filtros</button>}
      </div>
      {results.length === 0 && <p className="muted">Sin resultados. Prueba a quitar algún filtro.</p>}
      {results.slice(0, limit).map(c => <CardRow key={c.id} card={c} />)}
      {results.length > limit && <button className="btn btn-ghost" onClick={() => setLimit(limit + PAGE)}>Mostrar más</button>}
    </div>
  )
}
