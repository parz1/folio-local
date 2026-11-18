import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { library } from '../publishing/library.mjs'

test('only reviewed translations and asset bytes reach the test site', t => {
  const parent = resolve(tmpdir())
  const root = mkdtempSync(join(parent, 'folio-publication-'))
  t.after(() => {
    assert.equal(dirname(root), parent)
    rmSync(root, {recursive: true, force: true})
  })
  cpSync(new URL('../content/', import.meta.url), join(root, 'content'), {recursive: true})
  const db = library(root)
  const statuses = () => db.list().map(e => e.status)
  assert.deepEqual(statuses(), ['draft', 'draft', 'draft'])
  const first = db.check(['en'])
  assert.ok(first.changes[0].hunks.length)
  assert.equal(first.changes[0].media.length, 1)
  assert.deepEqual(db.current().documents, {})
  assert.throws(() => db.publish(['ja'], first.token), {status: 409})
  db.publish(['en'], first.token)
  const old = db.current().documents.en
  appendFileSync(join(root, 'content/en/index.md'), '\nOne more line.\n')
  assert.deepEqual(statuses(), ['draft', 'modified', 'draft'])
  const stale = db.check(['en', 'ja'])
  appendFileSync(join(root, 'content/assets/ink-study.png'), 'changed bytes')
  assert.throws(() => db.publish(['en', 'ja'], stale.token), {status: 409})
  const zh = db.check(['zh'])
  db.publish(['zh'], zh.token)
  assert.deepEqual(db.current().documents.en, old)
  const next = db.check(['en'])
  assert.ok(next.changes[0].hunks.flatMap(h => h.lines).includes('+One more line.'))
  assert.notEqual(next.changes[0].media[0].before, next.changes[0].media[0].after)
  db.publish(['en'], next.token)
  assert.deepEqual(statuses(), ['published', 'published', 'draft'])
  assert.deepEqual(library(root).current(), db.current())
})
