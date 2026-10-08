import type { Finish, PriceRow } from './db'

/** Acabados con precio de mercado, "normal" primero. */
export function finishList(p: PriceRow | undefined): [string, Finish][] {
  return Object.entries(p?.finishes ?? {})
    .filter(([, f]) => f?.market != null)
    .sort(([a], [b]) => (a === 'normal' ? -1 : b === 'normal' ? 1 : 0))
}
/** Precio de referencia de una carta: el normal si existe, si no el foil. */
export const cardPrice = (p: PriceRow | undefined): number | null => finishList(p)[0]?.[1].market ?? null
export const finishPrice = (p: PriceRow | undefined, finish: string): number | null => p?.finishes?.[finish]?.market ?? null

export type Currency = 'EUR' | 'USD'
const fmts = {
  EUR: new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }),
  USD: new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }),
}
/** Formateador de precios: recibe USD y muestra la moneda elegida (USD si aún no hay tipo de cambio). */
export function makeMoney(currency: Currency, usdEur: number | null) {
  const eur = currency === 'EUR' && !!usdEur
  return (usd: number | null | undefined) => usd == null ? '—' : eur ? fmts.EUR.format(usd * usdEur!) : fmts.USD.format(usd)
}
