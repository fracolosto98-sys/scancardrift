import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addToDeck, baseName, cardPrice, createDeck, db, deleteDeck, deckToText, offIdentity, parseDeckText, removeFromDeck, validateDeck, zoneOf,
  type Card, type DeckCard, type DeckItem, type Zone,
} from '../lib'
import { useCatalog, useToast } from '../state'
import { CardImg } from '../components/CardRow'
import { DomainChip, Stepper } from '../components/bits'
import Icon from '../components/Icon'

/** Agrupa las filas de un mazo con sus cartas y calcula el resumen. */
function useSummary() {
  const { byId, priceOf } = useCatalog()
  return useCallback((rows: DeckCard[]) => {
    const items: DeckItem[] = rows.flatMap(r => byId.get(r.cardId) ? [{ qty: r.qty, card: byId.get(r.cardId)! }] : [])
    const by = (z: Zone) => items.filter(x => zoneOf(x.card) === z).sort((a, b) => a.card.name.localeCompare(b.card.name))
    const n = (z: Zone) => by(z).reduce((s, x) => s + x.qty, 0)
    const price = (c: Card) => cardPrice(priceOf(c))
    const checks = validateDeck(items)
    return {
      items, legend: by('legend')[0]?.card, main: by('main'), runes: by('runes'), bf: by('battlefields'),
      counts: { main: n('main'), runes: n('runes'), bf: n('battlefields') },
      total: items.reduce((s, x) => s + x.qty * (price(x.card) ?? 0), 0),
      unpriced: items.filter(x => price(x.card) == null).length,
      checks, valid: checks.every(c => c.ok),
    }
  }, [byId, priceOf])
}

export default function Decks() {
  const nav = useNavigate()
  const toast = useToast()
  const { cards, money } = useCatalog()
  const summary = useSummary()
  const [name, setName] = useState('')
  const [importing, setImporting] = useState(false)
  const [text, setText] = useState('')
  const decks = useLiveQuery(async () => (await db.deckList.toArray()).sort((a, b) => b.createdAt - a.createdAt), [])
  const rows = useLiveQuery(() => db.deckSlots.toArray(), [])
  const list = useMemo(() => decks?.map(d => ({ d, s: summary(rows?.filter(r => r.deckId === d.id) ?? []) })), [decks, rows, summary])

  async function create() {
    const n = name.trim(); if (!n) return
    const id = await createDeck(n); setName(''); nav(`/mazos/${id}`)
  }
  async function importDeck() {
    const { found, missing } = parseDeckText(text, cards)
    if (!found.length) return toast('No se ha reconocido ninguna carta.')
    const title = text.match(/^#\s*(.+)$/m)?.[1]?.trim() || 'Mazo importado'
    const id = await createDeck(title, found.map(f => ({ cardId: f.card.id, qty: f.qty })))
    setText(''); setImporting(false)
    toast(missing.length ? `Importado. No se reconocieron ${missing.length} líneas: ${missing.slice(0, 3).join(' · ')}` : 'Mazo importado')
    nav(`/mazos/${id}`)
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold pt-2">Mazos</h1>
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); create() }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del mazo" aria-label="Nombre del mazo" className="field flex-1" />
        <button className="btn !w-auto" disabled={!name.trim()}>Crear</button>
      </form>
      <button className="text-sm muted underline" aria-expanded={importing} onClick={() => setImporting(!importing)}>Importar desde texto</button>
      {importing && (
        <div className="card p-3 space-y-2">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={8} className="field font-mono text-xs"
            placeholder={'# Mi mazo\n1 Jinx, Loose Cannon\n3 Jinx, Demolitionist\n6 Fury Rune\n…'} aria-label="Lista del mazo" />
          <button className="btn" onClick={importDeck} disabled={!text.trim()}>Importar</button>
        </div>
      )}
      {list?.length === 0 && <p className="muted">Crea tu primer mazo, elige una Leyenda y ve añadiendo cartas desde su ficha.</p>}
      {list?.map(({ d, s }) => (
        <Link key={d.id} to={`/mazos/${d.id}`} className="card flex items-center gap-3 p-3">
          {s.legend ? <CardImg card={s.legend} className="w-14 rounded-lg" /> : <div className="w-14 aspect-[5/7] rounded-lg bg-black/10" />}
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{d.name}</p>
            <p className="text-sm muted truncate">{s.legend ? baseName(s.legend) : 'Sin leyenda'} · {s.counts.main}/40</p>
            <p className={`text-xs ${s.valid ? 'teal' : 'muted'}`}>{s.valid ? '✓ Válido' : `${s.checks.filter(c => !c.ok).length} pendientes`}</p>
          </div>
          <b className="gold">{money(s.total)}</b>
        </Link>
      ))}
    </div>
  )
}

function ZoneGrid({ title, items, need, count, legend, onChange }: {
  title: string; items: DeckItem[]; need: number; count: number; legend?: Card; onChange: (c: Card, d: 1 | -1) => void
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title} <span className={count === need || (need === 40 && count > 40) ? 'teal' : 'muted'}>{count}/{need}</span></h2>
      {items.length === 0 && <p className="text-sm muted">Vacío.</p>}
      <div className="grid grid-cols-3 gap-2">
        {items.map(({ qty, card }) => {
          const off = offIdentity(legend, card)
          return (
            <div key={card.id} className="card p-1 text-center">
              <Link to={`/carta/${card.id}`}><CardImg card={card} w={400} className="rounded-lg w-full" /></Link>
              <p className="text-xs truncate mt-1" title={off ? 'Fuera de los dominios de la leyenda' : undefined}>{off && '⚠️ '}{baseName(card)}</p>
              <div className="flex justify-center"><Stepper label={baseName(card)} value={qty} onChange={d => onChange(card, d)} /></div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function DeckPage() {
  const nav = useNavigate()
  const toast = useToast()
  const { cards, byId, priceOf, money } = useCatalog()
  const summary = useSummary()
  const { id = '' } = useParams()
  const deck = useLiveQuery(async () => (await db.deckList.get(id)) ?? null, [id])
  const rows = useLiveQuery(() => db.deckSlots.where('deckId').equals(id).toArray(), [id])
  const owned = useLiveQuery(() => db.collection.toArray(), [])
  const s = useMemo(() => rows && summary(rows), [rows, summary])

  // Coste para completarlo: copias que faltan en la colección (vale cualquier impresión del mismo nombre),
  // a la impresión más barata de cada nombre.
  const missing = useMemo(() => {
    if (!s || !owned) return null
    const have = new Map<string, number>(), cheapest = new Map<string, number>()
    owned.forEach(o => { const c = byId.get(o.cardId); if (c) have.set(baseName(c), (have.get(baseName(c)) ?? 0) + o.qty) })
    cards.forEach(c => { const p = cardPrice(priceOf(c)); if (p != null && p < (cheapest.get(baseName(c)) ?? Infinity)) cheapest.set(baseName(c), p) })
    const need = new Map<string, number>()
    s.items.forEach(x => need.set(baseName(x.card), (need.get(baseName(x.card)) ?? 0) + x.qty))
    let copies = 0, cost = 0
    need.forEach((q, n) => { const m = Math.max(0, q - (have.get(n) ?? 0)); copies += m; cost += m * (cheapest.get(n) ?? 0) })
    return { copies, cost }
  }, [s, owned, cards, byId, priceOf])

  if (deck === null) return <div className="card p-4 space-y-3"><p>Este mazo no existe.</p><Link to="/mazos" className="btn">Ver mis mazos</Link></div>
  if (!deck || !s) return <p className="muted">Cargando…</p>

  async function change(c: Card, d: 1 | -1) {
    if (d === 1) { const err = await addToDeck(id, c); if (err) toast(err) }
    else await removeFromDeck(id, c.id)
  }
  async function remove() {
    if (!confirm(`¿Eliminar el mazo «${deck!.name}»?`)) return
    await deleteDeck(id)
    nav('/mazos')
  }
  async function duplicate() {
    nav(`/mazos/${await createDeck(`${deck!.name} (copia)`, rows!)}`)
  }
  async function share() {
    const text = deckToText(deck!.name, s!.items)
    try {
      if (navigator.share) await navigator.share({ title: deck!.name, text })
      else { await navigator.clipboard.writeText(text); toast('Lista copiada al portapapeles') }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') { await navigator.clipboard?.writeText(text).catch(() => {}); toast('Lista copiada al portapapeles') }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center pt-2 gap-2">
        <h1 className="text-2xl font-bold truncate">{deck.name}</h1>
        <button className="text-sm muted underline shrink-0" onClick={() => { const n = prompt('Nuevo nombre', deck.name)?.trim(); if (n) db.deckList.update(id, { name: n }) }}>Renombrar</button>
      </div>
      <div className="card p-4 flex gap-3 items-center">
        {s.legend ? <Link to={`/carta/${s.legend.id}`} className="w-20 shrink-0"><CardImg card={s.legend} w={400} className="w-full rounded-lg" /></Link>
          : <div className="w-20 aspect-[5/7] rounded-lg bg-black/10" />}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-semibold">{s.legend?.name ?? 'Sin leyenda'}</p>
          {s.legend ? <div className="flex gap-1 flex-wrap">{s.legend.domains?.map(d => <DomainChip key={d} d={d} />)}</div>
            : <p className="text-sm muted">Añade una carta de tipo Leyenda desde su ficha.</p>}
          <p className="text-2xl font-bold gold">{money(s.total)}</p>
          {s.unpriced > 0 && <p className="text-xs muted">{s.unpriced} carta(s) sin precio no suman.</p>}
          {missing && s.items.length > 0 && (missing.copies
            ? <p className="text-xs muted">Te faltan {missing.copies} cartas de tu colección (≈ {money(missing.cost)}).</p>
            : <p className="text-xs teal">Tienes todas las cartas en tu colección.</p>)}
        </div>
      </div>

      <details className="card p-4" open={!s.valid && s.items.length > 0}>
        <summary className={`font-semibold cursor-pointer ${s.valid ? 'teal' : ''}`}>
          {s.valid ? '✓ Mazo completo y válido' : `Reglas del mazo: ${s.checks.filter(c => !c.ok).length} pendientes`}
        </summary>
        <ul className="mt-2 space-y-1 text-sm">
          {s.checks.map(c => <li key={c.label} className={c.ok ? 'teal' : 'muted'}>{c.ok ? '✓' : '○'} {c.label}</li>)}
        </ul>
      </details>

      <Link to="/buscar" className="btn btn-ghost">Buscar cartas para añadir</Link>
      <ZoneGrid title="Mazo principal" items={s.main} need={40} count={s.counts.main} legend={s.legend} onChange={change} />
      <ZoneGrid title="Runas" items={s.runes} need={12} count={s.counts.runes} legend={s.legend} onChange={change} />
      <ZoneGrid title="Campos de batalla" items={s.bf} need={3} count={s.counts.bf} onChange={change} />
      {s.legend && <p className="text-xs muted">⚠️ = la carta tiene un dominio que no pertenece a la identidad de la leyenda.</p>}

      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-ghost" onClick={share} disabled={!s.items.length}><Icon name="share" />Compartir lista</button>
        <button className="btn btn-ghost" onClick={duplicate}>Duplicar</button>
      </div>
      <button className="btn btn-ghost text-[#e5484d]" onClick={remove}>Eliminar mazo</button>
    </div>
  )
}
