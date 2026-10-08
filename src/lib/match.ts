import type { Card } from './db'

// Módulo puro (sin Dexie ni DOM) para poder probarlo con `npm test`.

type MCard = Pick<Card, 'id' | 'name' | 'riftboundId' | 'set'>
export interface MatchIndex<C extends MCard = MCard> {
  names: { key: string; cards: C[]; weight: number }[]
  byNumber: Map<string, C[]>
  sets: string[]
}

/** Solo letras y dígitos en mayúsculas: el OCR inventa espacios y signos. */
const squash = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export function buildIndex<C extends MCard>(cards: C[]): MatchIndex<C> {
  const names = new Map<string, { cards: C[]; weight: number }>()
  const byNumber = new Map<string, C[]>()
  const addName = (key: string, c: C, weight: number) => {
    if (key.length < 4) return
    const e = names.get(key) ?? { cards: [], weight }
    if (!e.cards.includes(c)) e.cards.push(c)
    e.weight = Math.max(e.weight, weight)
    names.set(key, e)
  }
  for (const c of cards) {
    const base = c.name.replace(/\s*\(.*\)\s*$/, '')
    addName(squash(base), c, 4)
    // En la carta el campeón va en una etiqueta pequeña y el título es solo el subtítulo ("Daughter of the Void").
    const sub = squash(base.split(',').slice(1).join(','))
    if (sub.length >= 8) addName(sub, c, 3)
    const [, num = '', total = ''] = c.riftboundId.split('-')
    const n = num.match(/^\d{3}/)?.[0]
    if (n && /^\d{3}$/.test(total)) byNumber.set(`${n}/${total}`, [...(byNumber.get(`${n}/${total}`) ?? []), c])
  }
  return { names: [...names].map(([key, e]) => ({ key, ...e })), byNumber, sets: [...new Set(cards.map(c => c.set))] }
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

/**
 * Parecido 0–1 entre una línea leída y un nombre; 1 si una línea corta (un título, no el texto de reglas,
 * donde también aparecen nombres) contiene el nombre tal cual.
 */
export function similarity(line: string, key: string): number {
  if (line.includes(key) && line.length <= key.length * 1.4 + 4) return 1
  const max = Math.max(line.length, key.length)
  if (Math.abs(line.length - key.length) / max > 0.25) return 0 // imposible llegar al umbral
  return 1 - levenshtein(line, key) / max
}

const DIGIT: Record<string, string> = { O: '0', D: '0', Q: '0', I: '1', L: '1', '|': '1', Z: '2', S: '5', B: '8', G: '6' }
const toDigits = (s: string) => s.toUpperCase().replace(/[ODQIL|ZSBG]/g, ch => DIGIT[ch])

export interface MatchResult<C> { cards: C[]; confident: boolean }

/**
 * Busca la carta en el texto del OCR. El número de colección ("027/298") junto al código de set es lo más fiable;
 * el nombre se compara de forma aproximada línea a línea (y uniendo líneas contiguas, porque el título suele partirse).
 */
export function findMatches<C extends MCard>(text: string, idx: MatchIndex<C>): MatchResult<C> {
  const score = new Map<C, { s: number; byNum: boolean; byName: boolean }>()
  const bump = (c: C, s: number, kind: 'num' | 'name') => {
    const e = score.get(c) ?? { s: 0, byNum: false, byName: false }
    if (kind === 'num' && !e.byNum) { e.s += s; e.byNum = true }
    if (kind === 'name' && !e.byName) { e.s += s; e.byName = true }
    score.set(c, e)
  }

  // 1) Número de colección: tres "dígitos" (tolerando O/I/S…), barra, tres dígitos.
  const up = text.toUpperCase()
  const sets = idx.sets.filter(s => new RegExp(`(^|[^A-Z])${s.replace(/O/g, '[O0]').replace(/I/g, '[I1L]')}([^A-Z]|$)`).test(up))
  for (const m of up.matchAll(/([0-9ODQILSZBG|]{3})[A-Z*]?\s*[/\\|]\s*([0-9ODQILSZBG|]{3})/g)) {
    const found = idx.byNumber.get(`${toDigits(m[1])}/${toDigits(m[2])}`) ?? []
    const inSet = found.filter(c => sets.includes(c.set))
    for (const c of inSet.length ? inSet : found) bump(c, inSet.length ? 7 : 5, 'num')
  }

  // 2) Nombre.
  const lines = text.split('\n').map(squash).filter(l => l.length >= 3)
  const probes = [...lines, ...lines.slice(1).map((l, i) => lines[i] + l)]
  for (const { key, cards, weight } of idx.names) {
    let best = 0
    for (const p of probes) if ((best = Math.max(best, similarity(p, key))) === 1) break
    const need = key.length >= 10 ? 0.78 : key.length >= 6 ? 0.84 : 0.99
    if (best >= need) for (const c of cards) bump(c, weight * best, 'name')
  }

  const ranked = [...score].sort((a, b) => b[1].s - a[1].s)
  if (!ranked.length) return { cards: [], confident: false }
  const top = ranked[0][1].s
  const cards = ranked.filter(([, e]) => e.s >= top - 0.5).slice(0, 8).map(([c]) => c)
  const both = ranked[0][1].byNum && ranked[0][1].byName
  return { cards, confident: cards.length === 1 && both }
}
