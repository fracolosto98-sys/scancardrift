import { db, type Card } from './db'
import { baseName, isToken, norm, zoneOf, type Zone } from './cards'

export type DeckItem = { qty: number; card: Card }

/** Carta con algún dominio fuera de la identidad de la leyenda (las incoloras valen en cualquier mazo). */
export const offIdentity = (legend: Card | undefined, c: Card) =>
  !!legend && c.domains?.some(d => d !== 'Colorless' && !legend.domains?.includes(d))

/** Añade una copia respetando las reglas de construcción. Devuelve un mensaje si no se puede. */
export async function addToDeck(deckId: number, card: Card): Promise<string | null> {
  if (isToken(card)) return 'Las fichas no se incluyen en el mazo.'
  return db.transaction('rw', db.deckCards, db.cards, async () => {
    const rows = await db.deckCards.where('deckId').equals(deckId).toArray()
    const cards = await db.cards.bulkGet(rows.map(r => r.cardId))
    const z = zoneOf(card)
    const inZone = rows.map((r, i) => ({ r, c: cards[i] })).filter(x => x.c && zoneOf(x.c) === z)
    const total = inZone.reduce((s, x) => s + x.r.qty, 0)
    const same = inZone.filter(x => baseName(x.c!) === baseName(card)).reduce((s, x) => s + x.r.qty, 0)

    if (z === 'legend') {
      await db.deckCards.bulkDelete(inZone.map(x => [deckId, x.r.cardId] as [number, string]))
      await db.deckCards.put({ deckId, cardId: card.id, qty: 1 })
      return null
    }
    if (z === 'runes' && total >= 12) return 'El mazo de runas ya tiene 12.'
    if (z === 'battlefields' && same >= 1) return 'Los campos de batalla deben ser distintos.'
    if (z === 'battlefields' && total >= 3) return 'Ya tienes 3 campos de batalla.'
    if (z === 'main' && same >= 3) return 'Máximo 3 copias del mismo nombre.'
    const cur = await db.deckCards.get([deckId, card.id])
    await db.deckCards.put({ deckId, cardId: card.id, qty: (cur?.qty ?? 0) + 1 })
    return null
  })
}

export async function removeFromDeck(deckId: number, cardId: string) {
  const cur = await db.deckCards.get([deckId, cardId])
  if (cur && cur.qty > 1) await db.deckCards.put({ ...cur, qty: cur.qty - 1 })
  else await db.deckCards.delete([deckId, cardId])
}

export interface Check { ok: boolean; label: string }

/** Reglas de construcción de Riftbound, como lista para mostrar qué falta. */
export function validateDeck(items: DeckItem[]): Check[] {
  const by = (z: Zone) => items.filter(x => zoneOf(x.card) === z)
  const n = (xs: DeckItem[]) => xs.reduce((s, x) => s + x.qty, 0)
  const legend = by('legend')[0]?.card
  const main = by('main'), runes = by('runes'), bf = by('battlefields')
  const champ = legend?.tags?.[0]
  const sigs = n(main.filter(x => x.card.supertype === 'Signature'))
  const names = new Map<string, number>()
  main.forEach(x => names.set(baseName(x.card), (names.get(baseName(x.card)) ?? 0) + x.qty))
  return [
    { ok: !!legend, label: 'Una leyenda' },
    { ok: n(main) >= 40, label: `Al menos 40 cartas en el mazo principal (${n(main)})` },
    { ok: !!champ && main.some(x => x.card.supertype === 'Champion' && x.card.type === 'Unit' && x.card.tags?.includes(champ)),
      label: `Campeón elegido${champ ? ` (unidad Campeón de ${champ})` : ''}` },
    { ok: [...names.values()].every(q => q <= 3), label: 'Máximo 3 copias de cada nombre' },
    { ok: sigs <= 3 && main.every(x => x.card.supertype !== 'Signature' || (!!champ && x.card.tags?.includes(champ))),
      label: `Hasta 3 cartas de firma, todas de tu campeón (${sigs})` },
    { ok: !!legend && [...main, ...runes].every(x => !offIdentity(legend, x.card)), label: 'Todas las cartas en los dominios de la leyenda' },
    { ok: n(runes) === 12, label: `12 runas (${n(runes)})` },
    { ok: n(bf) === 3 && bf.length === 3, label: `3 campos de batalla distintos (${n(bf)})` },
  ]
}

// ---------- Exportar / importar como texto ----------
const SECTIONS: [Zone, string][] = [['legend', 'Legend'], ['main', 'Main Deck'], ['battlefields', 'Battlefields'], ['runes', 'Runes']]

export function deckToText(name: string, items: DeckItem[]): string {
  const out = [`# ${name}`]
  for (const [z, title] of SECTIONS) {
    const xs = items.filter(x => zoneOf(x.card) === z)
    if (!xs.length) continue
    out.push('', `${title}:`, ...xs.sort((a, b) => a.card.name.localeCompare(b.card.name)).map(x => `${x.qty} ${x.card.name}`))
  }
  return out.join('\n')
}

/**
 * Lee listas tipo "3 Jinx, Demolitionist", "3x Jinx…" o "Jinx… x3"; ignora cabeceras y comentarios.
 * Entre varias impresiones del mismo nombre elige la normal (no alternativa ni promo).
 */
export function parseDeckText(text: string, cards: Card[]): { found: { card: Card; qty: number }[]; missing: string[] } {
  const byName = new Map<string, Card[]>()
  for (const c of cards) if (!isToken(c)) for (const k of new Set([norm(c.name), norm(baseName(c))]))
    byName.set(k, [...(byName.get(k) ?? []), c])
  const rank = (c: Card) => (c.alt ? 2 : 0) + (c.rarity === 'Promo' ? 1 : 0) + (/\(/.test(c.name) ? 1 : 0)
  const found = new Map<string, { card: Card; qty: number }>()
  const missing: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//') || /:$/.test(line)) continue
    let qty = 1, name = line, m: RegExpMatchArray | null
    if ((m = line.match(/^(\d+)\s*x?\s+(.+)$/i))) { qty = Number(m[1]); name = m[2] }
    else if ((m = line.match(/^(.+?)\s+x(\d+)$/i))) { name = m[1]; qty = Number(m[2]) }
    name = name.replace(/\s*[[(][A-Z]{2,4}[-\s]?\d+[a-z*]?[\])]\s*$/i, '').trim()
    const opts = byName.get(norm(name))
    if (!opts?.length || !qty) { missing.push(line); continue }
    const card = [...opts].sort((a, b) => rank(a) - rank(b) || a.riftboundId.localeCompare(b.riftboundId))[0]
    const prev = found.get(card.id)
    found.set(card.id, { card, qty: (prev?.qty ?? 0) + qty })
  }
  return { found: [...found.values()], missing }
}
