import Dexie, { type Table } from 'dexie'

export interface Card {
  id: string; riftboundId: string; name: string; cleanName: string; num: number
  energy: number | null; might: number | null; power: number | null
  type: string; supertype: string | null; rarity: string; domains: string[]
  text: string | null; rich: string | null; flavour: string | null
  set: string; setName: string; tags: string[]; artist: string | null
  tcgId: string | null; imgUrl: string; orientation: 'portrait' | 'landscape'
  alt: boolean; sig: boolean; over: boolean
}
export interface Finish { low: number | null; mid: number | null; high: number | null; market: number | null }
/** Precios de TCGplayer. La clave es tcgId: varias impresiones comparten riftboundId (p. ej. Annie normal y Metal). */
export interface PriceRow { tcgId: string; riftboundId: string; purchaseUri: string; updatedAt: string; finishes: Record<string, Finish> }
export interface Deck { id?: number; name: string; createdAt: number }
export interface DeckCard { deckId: number; cardId: string; qty: number }
export type FinishName = 'normal' | 'foil'
export interface Owned { cardId: string; finish: FinishName; qty: number; addedAt: number }
/** Una foto diaria del precio de mercado (USD) de las cartas que sigue el usuario. */
export interface PricePoint { tcgId: string; day: string; normal: number | null; foil: number | null }

class AppDB extends Dexie {
  cards!: Table<Card, string>
  market!: Table<PriceRow, string>
  kv!: Table<{ k: string; v: unknown }, string>
  favs!: Table<{ id: string }, string>
  history!: Table<{ n?: number; id: string; ts: number }, number>
  decks!: Table<Deck, number>
  deckCards!: Table<DeckCard, [number, string]>
  collection!: Table<Owned, [string, FinishName]>
  priceHist!: Table<PricePoint, [string, string]>
  constructor() {
    super('scancard') // nombre histórico: cambiarlo perdería los datos de los usuarios
    this.version(3).stores({
      cards: 'id, name, set', prices: 'riftboundId', kv: 'k', favs: 'id', history: '++n, id, ts',
      decks: '++id', deckCards: '[deckId+cardId], deckId',
    })
    this.version(4).stores({
      cards: 'id, name, set, tcgId', prices: null, market: 'tcgId',
      collection: '[cardId+finish], cardId', priceHist: '[tcgId+day], tcgId',
    }).upgrade(tx => tx.table('kv').bulkDelete(['catalogAt', 'pricesAt']))
  }
}
export const db = new AppDB()

export async function getKv<T>(k: string): Promise<T | undefined> {
  return (await db.kv.get(k))?.v as T | undefined
}
export const setKv = (k: string, v: unknown) => db.kv.put({ k, v })
