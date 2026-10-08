import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSync, stable, type LocalEntry, type RemoteRow, type ShadowEntry } from './syncplan.ts'

const fav = (id: string): LocalEntry => ({ tbl: 'favs', key: id, data: { id } })
const own = (cardId: string, qty: number): LocalEntry => ({ tbl: 'collection', key: `${cardId}|normal`, data: { cardId, finish: 'normal', qty, addedAt: 1 } })
const synced = (e: LocalEntry): ShadowEntry => ({ tbl: e.tbl, key: e.key, json: stable(e.data) })
const remote = (e: LocalEntry, at = '2026-01-01T00:00:01Z', deleted = false): RemoteRow =>
  ({ tbl: e.tbl, key: e.key, data: deleted ? null : e.data, deleted, updated_at: 1, synced_at: at })
const keys = (xs: { key: string }[]) => xs.map(x => x.key).sort()

test('stable no depende del orden de las claves', () => {
  assert.equal(stable({ b: 1, a: 2 }), stable({ a: 2, b: 1 }))
})

test('sin cambios no hace nada', () => {
  const l = [fav('a'), own('x', 2)]
  const p = planSync(l, l.map(synced), [], false)
  assert.deepEqual([p.apply, p.push], [[], []])
})

test('sube altas, cambios y borrados locales', () => {
  const p = planSync([own('x', 3), fav('new')], [synced(own('x', 2)), synced(fav('gone'))], [], false)
  assert.deepEqual(keys(p.push), ['gone', 'new', 'x|normal'])
  assert.equal(p.push.find(x => x.key === 'gone')!.deleted, true)
})

test('aplica cambios y borrados remotos si no hay cambio local', () => {
  const l = [own('x', 2), fav('a')]
  const p = planSync(l, l.map(synced), [remote(own('x', 5)), remote(fav('a'), undefined, true), remote(fav('b'))], false)
  assert.deepEqual(keys(p.apply), ['a', 'b', 'x|normal'])
  assert.deepEqual(p.push, [])
})

test('conflicto: gana el cambio local pendiente', () => {
  const p = planSync([own('x', 4)], [synced(own('x', 2))], [remote(own('x', 9))], false)
  assert.deepEqual(p.apply, [])
  assert.equal(p.push[0].data!.qty, 4)
})

test('primera sincronización: gana la nube, lo local nuevo se sube y no se propagan borrados', () => {
  const p = planSync([own('x', 1), fav('solo-local')], [], [remote(own('x', 7)), remote(fav('solo-nube'))], true)
  assert.deepEqual(keys(p.apply), ['solo-nube', 'x|normal'])
  assert.deepEqual(keys(p.push), ['solo-local'])
})

test('lo que ya coincide solo se marca como sincronizado (sin reescribir en local)', () => {
  const p = planSync([fav('a')], [], [remote(fav('a'))], true)
  assert.deepEqual([p.apply.length, p.push.length, p.same.length], [0, 0, 1])
})

test('filas repetidas en páginas solapadas: vale la más reciente', () => {
  const p = planSync([], [], [remote(own('x', 1), '2026-01-01T00:00:01Z'), remote(own('x', 2), '2026-01-01T00:00:02Z')], false)
  assert.equal(p.apply.length, 1)
  assert.equal(p.apply[0].data!.qty, 2)
})
