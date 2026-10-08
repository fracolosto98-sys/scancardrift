import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, makeMoney, type Card, type Currency, type PriceRow } from './lib'

// ---------- Catálogo en memoria: una sola lectura de IndexedDB para toda la app ----------
interface Catalog {
  cards: Card[]
  byId: Map<string, Card>
  priceOf: (c: Card | undefined) => PriceRow | undefined
  money: (usd: number | null | undefined) => string
  currency: Currency
  rate: number | null
}
const CatalogCtx = createContext<Catalog | null>(null)

export function CatalogProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const market = useLiveQuery(() => db.market.toArray(), [])
  const kv = useLiveQuery(() => db.kv.bulkGet(['fxRate', 'currency']), [])
  const value = useMemo<Catalog | null>(() => {
    if (!cards || !market || !kv) return null
    const prices = new Map(market.map(p => [p.tcgId, p]))
    const rate = (kv[0]?.v as number) ?? null
    const currency = (kv[1]?.v as Currency) ?? 'EUR'
    return {
      cards, byId: new Map(cards.map(c => [c.id, c])),
      priceOf: c => (c?.tcgId ? prices.get(c.tcgId) : undefined),
      money: makeMoney(currency, rate), currency, rate,
    }
  }, [cards, market, kv])
  if (!value) return fallback
  return <CatalogCtx.Provider value={value}>{children}</CatalogCtx.Provider>
}

export function useCatalog(): Catalog {
  const c = useContext(CatalogCtx)
  if (!c) throw new Error('useCatalog fuera de CatalogProvider')
  return c
}

/** Resuelve ids a cartas conservando el orden y descartando las que ya no existen. */
export function useCards(ids: string[] | undefined): Card[] | undefined {
  const { byId } = useCatalog()
  return useMemo(() => ids?.flatMap(id => byId.get(id) ?? []), [ids, byId])
}

// ---------- Avisos ----------
type Toast = { id: number; text: string; action?: { label: string; run: () => void } }
const ToastCtx = createContext<(text: string, action?: Toast['action']) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const show = useCallback((text: string, action?: Toast['action']) => {
    const id = ++seq.current
    setToasts(t => [...t.slice(-2), { id, text, action }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), action ? 5000 : 2800)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" className="fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} role="status" className="toast pointer-events-auto">
            <span>{t.text}</span>
            {t.action && <button className="font-semibold underline" onClick={() => { t.action!.run(); setToasts(x => x.filter(y => y.id !== t.id)) }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)
