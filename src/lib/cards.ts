import type { Card } from './db'

/** "Jinx, Demolitionist (Alternate Art)" → "Jinx, Demolitionist" */
export const baseName = (c: Pick<Card, 'name'>) => c.name.replace(/\s*\(.*\)\s*$/, '')
/** Minúsculas, sin acentos ni signos: "Kai'Sa" y "kaisa" coinciden. */
export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
/** Número de colección tal como se imprime: "027", "007a", "299*". */
export const collectorNo = (c: Pick<Card, 'riftboundId'>) => c.riftboundId.split('-')[1] ?? ''

export type Zone = 'legend' | 'runes' | 'battlefields' | 'main'
export const zoneOf = (c: Pick<Card, 'type'>): Zone => {
  const t = (c.type ?? '').toLowerCase()
  return t.startsWith('legend') ? 'legend' : t.startsWith('rune') ? 'runes' : t.startsWith('battlefield') ? 'battlefields' : 'main'
}
export const isToken = (c: Pick<Card, 'supertype'>) => c.supertype === 'Token'

// ---------- Etiquetas en español (los valores originales se mantienen para filtrar) ----------
const LABELS: Record<string, string> = {
  Unit: 'Unidad', Spell: 'Hechizo', Gear: 'Equipo', Rune: 'Runa', Legend: 'Leyenda', Battlefield: 'Campo de batalla',
  Common: 'Común', Uncommon: 'Infrecuente', Rare: 'Rara', Epic: 'Épica', Showcase: 'Showcase', Promo: 'Promo',
  Fury: 'Furia', Calm: 'Calma', Mind: 'Mente', Body: 'Cuerpo', Chaos: 'Caos', Order: 'Orden', Colorless: 'Incoloro',
  Champion: 'Campeón', Signature: 'Firma', Basic: 'Básica', Token: 'Ficha',
  normal: 'Normal', foil: 'Foil',
}
export const es = (s: string | null | undefined) => (s ? LABELS[s] ?? s : '')

export const DOMAIN_COLORS: Record<string, string> = {
  Fury: '#e5484d', Calm: '#30a46c', Mind: '#3e8ef7', Body: '#f08c2e', Chaos: '#8e4ec6', Order: '#e9b44c', Colorless: '#8b8fa8',
}

// ---------- Texto de reglas ----------
export type RulePart =
  | { t: 'text'; v: string } | { t: 'kw'; v: string } | { t: 'energy'; n: string }
  | { t: 'rune'; d: string } | { t: 'might' } | { t: 'exhaust' } | { t: 'br' }

const decode = (s: string) => s
  .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')

/** Convierte el HTML simple de la API (p, br, ul/li) y sus símbolos :rb_*: en piezas que React pinta sin innerHTML. */
export function parseRules(c: Pick<Card, 'rich' | 'text'>): RulePart[] {
  const src = c.rich
    ? decode(c.rich.replace(/<li>/g, '\n• ').replace(/<br\s*\/?>|<\/p>\s*<p>|<\/?ul>/g, '\n').replace(/<[^>]+>/g, ''))
    : decode(c.text ?? '')
  const out: RulePart[] = []
  src.trim().split(/\n+/).forEach((line, i) => {
    if (i) out.push({ t: 'br' })
    for (const m of line.matchAll(/:rb_([a-z]+)(?:_([a-z0-9]+))?:|\[([^\]]+)\]|([^:[]+|[:[])/g)) {
      const [, sym, arg, kw, txt] = m
      if (txt) {
        const last = out[out.length - 1]
        if (last?.t === 'text') last.v += txt; else out.push({ t: 'text', v: txt })
      } else if (kw) out.push({ t: 'kw', v: kw })
      else if (sym === 'energy') out.push({ t: 'energy', n: arg ?? '' })
      else if (sym === 'rune') out.push({ t: 'rune', d: arg ?? '' })
      else if (sym === 'might') out.push({ t: 'might' })
      else if (sym === 'exhaust') out.push({ t: 'exhaust' })
      else out.push({ t: 'text', v: m[0] })
    }
  })
  return out
}

// ---------- Imágenes ----------
/** Versión reducida de la imagen si el CDN lo permite; si no, la original. */
export function thumbUrl(url: string, w: 200 | 400 = 200): string {
  if (url.includes('cmsassets.rgpub.io')) return `${url}${url.includes('?') ? '&' : '?'}w=${w}&fm=webp&q=70`
  if (url.includes('tcgplayer-cdn.tcgplayer.com')) return url.replace(/_in_\d+x\d+\.jpg$/, `_${w}w.jpg`)
  return url
}

// ---------- Cardmarket ----------
const CM = 'https://www.cardmarket.com/es/Riftbound/Products'
const CM_SETS: Record<string, string> = { OGN: 'Origins', SFD: 'Spiritforged', UNL: 'Unleashed', VEN: 'Vendetta' }

/** "Rek'Sai, Void Burrower" → "RekSai-Void-Burrower": sin acentos ni signos, espacios a guiones. */
const cmSlug = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')

export function cardmarketSearchUrl(c: Card, foil: boolean): string {
  const q = new URLSearchParams({ searchString: baseName(c) })
  if (foil) q.set('isFoil', 'Y')
  return `${CM}/Search?${q}`
}

/** Ficha directa si la carta es "normal" y su set está soportado; si no, búsqueda. */
export function cardmarketUrl(c: Card, foil: boolean): string {
  const set = CM_SETS[c.set]
  const direct = set && !c.alt && /^\d+$/.test(collectorNo(c)) && !/[()]/.test(c.name) && zoneOf(c) !== 'runes'
  if (!direct) return cardmarketSearchUrl(c, foil)
  return `${CM}/Singles/${set}/${cmSlug(c.name)}${foil ? '?isFoil=Y' : ''}`
}
