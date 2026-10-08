import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIndex, findMatches, similarity } from './match.ts'

const card = (id: string, riftboundId: string, name: string, set = riftboundId.slice(0, 3).toUpperCase()) =>
  ({ id, riftboundId, name, set })

const cards = [
  card('jinx', 'ogn-030-298', 'Jinx, Demolitionist'),
  card('jinx-alt', 'ogn-030a-298', 'Jinx, Demolitionist (Alternate Art)'),
  card('jinx-legend', 'ogn-251-298', 'Jinx, Loose Cannon'),
  card('jinx-legend-opp', 'opp-251-298', 'Jinx, Loose Cannon'),
  card('kaisa', 'ogn-247-298', "Kai'Sa, Daughter of the Void"),
  card('buff', 'unl-t04', 'Buff'),
  card('fury', 'ogn-007-298', 'Fury Rune'),
]
const idx = buildIndex(cards)
const ids = (text: string) => findMatches(text, idx).cards.map(c => c.id).sort()

test('similarity tolera errores de OCR', () => {
  assert.equal(similarity('JINXDEMOLITIONIST', 'JINXDEMOLITIONIST'), 1)
  assert.ok(similarity('J1NXDEMOLlTIONIST', 'JINXDEMOLITIONIST') > 0.85)
  assert.equal(similarity('SOMETHINGCOMPLETELYDIFFERENTANDLONG', 'BUFF'), 0)
})

test('número de colección y set identifican la carta con seguridad', () => {
  const r = findMatches('Jinx, Loose Cannon\nLEGEND\nOGN · 251/298', idx)
  assert.deepEqual(r.cards.map(c => c.id), ['jinx-legend'])
  assert.equal(r.confident, true)
})

test('el número tolera O/0 e I/1 y separa sets con el mismo número', () => {
  assert.deepEqual(ids('0GN 25I/298'), ['jinx-legend'])
  assert.deepEqual(ids('OPP 251/298'), ['jinx-legend-opp'])
})

test('título partido en dos líneas y con ruido', () => {
  assert.deepEqual(ids('3\nJ1NX\nDEMOLITI0NIST\nUnit — Piltover'), ['jinx', 'jinx-alt'])
})

test("apóstrofos y nombres largos: Kai'Sa", () => {
  assert.deepEqual(ids('KAISA, DAUGHTER OF THE VOlD'), ['kaisa'])
})

test('el título impreso es solo el subtítulo (el campeón va en una etiqueta aparte)', () => {
  assert.deepEqual(ids('LEGEND\nDaughter of the Void\nUse only to play spells.'), ['kaisa'])
})

test('un nombre corto dentro del texto de reglas no cuenta', () => {
  assert.deepEqual(ids('When you play me, give a unit [Buff] and draw a card for each Buff you control.'), [])
})

test('sin coincidencias', () => {
  assert.deepEqual(findMatches('', idx), { cards: [], confident: false })
})
