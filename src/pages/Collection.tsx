import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { collectorNo, db, download, es, finishPrice } from '../lib'
import { useCards, useCatalog } from '../state'
import CardRow from '../components/CardRow'
import { Segmented } from '../components/bits'

type View = 'coleccion' | 'favoritos'
type Sort = 'value' | 'name' | 'recent'

export default function Collection() {
  const [params, setParams] = useSearchParams()
  const view = (params.get('ver') ?? 'coleccion') as View
  const sort = (params.get('orden') ?? 'value') as Sort
  const setParam = (k: string, v: string) => setParams(p => { p.set(k, v); return p }, { replace: true })
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold pt-2">{view === 'favoritos' ? 'Favoritos' : 'Mi colección'}</h1>
      <Segmented label="Ver" value={view} onChange={v => setParam('ver', v)} options={[['coleccion', 'Colección'], ['favoritos', 'Favoritos']]} />
      {view === 'favoritos' ? <Favorites /> : <Owned sort={sort} setSort={s => setParam('orden', s)} />}
    </div>
  )
}

function Owned({ sort, setSort }: { sort: Sort; setSort: (s: Sort) => void }) {
  const { byId, priceOf, money } = useCatalog()
  const owned = useLiveQuery(() => db.collection.toArray(), [])
  const rows = useMemo(() => (owned ?? []).flatMap(o => {
    const card = byId.get(o.cardId)
    if (!card) return []
    const unit = finishPrice(priceOf(card), o.finish)
    return [{ ...o, card, unit, value: unit == null ? null : unit * o.qty }]
  }).sort((a, b) =>
    sort === 'name' ? a.card.name.localeCompare(b.card.name)
      : sort === 'recent' ? b.addedAt - a.addedAt
      : (b.value ?? -1) - (a.value ?? -1)), [owned, byId, priceOf, sort])

  if (!owned) return null
  if (!rows.length) return (
    <div className="card p-4 space-y-3">
      <p className="muted">Tu colección está vacía. Escanea tus cartas en modo «Colección» o añádelas desde la ficha de cada carta.</p>
      <Link to="/escanear?modo=lote" className="btn">Escanear en lote</Link>
    </div>
  )

  const total = rows.reduce((s, r) => s + (r.value ?? 0), 0)
  const copies = rows.reduce((s, r) => s + r.qty, 0)
  const unpriced = rows.filter(r => r.value == null).length

  function exportCsv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = [['Nombre', 'Colección', 'Número', 'Acabado', 'Cantidad', 'Precio unidad (USD)'].join(';'),
      ...rows.map(r => [esc(r.card.name), esc(r.card.setName), collectorNo(r.card), r.finish, r.qty, r.unit?.toFixed(2) ?? ''].join(';'))]
    download(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv' }), `foilio-coleccion-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <>
      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-sm muted">{copies} cartas · {rows.length} distintas</p>
          {unpriced > 0 && <p className="text-xs muted">{unpriced} sin precio no suman</p>}
        </div>
        <p className="text-2xl font-bold gold">{money(total)}</p>
      </div>
      <div className="flex gap-2">
        <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Ordenar por" className="field text-sm flex-1">
          <option value="value">Más valiosas</option><option value="name">Nombre A–Z</option><option value="recent">Añadidas recientemente</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv}>Exportar CSV</button>
      </div>
      {rows.map(r => (
        <CardRow key={`${r.cardId}-${r.finish}`} card={r.card}
          sub={<>{r.qty} × {es(r.finish)}{r.unit != null && ` · ${money(r.unit)} c/u`}</>}
          right={<p className="font-semibold gold">{money(r.value)}</p>} />
      ))}
    </>
  )
}

function Favorites() {
  const ids = useLiveQuery(async () => (await db.favs.toArray()).map(f => f.id), [])
  const cards = useCards(ids)
  if (!cards) return null
  if (!cards.length) return <p className="muted">Todavía no tienes favoritos. Abre una carta y pulsa la estrella.</p>
  return <>{cards.map(c => <CardRow key={c.id} card={c} />)}</>
}
