import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, dirname, resolve} from 'node:path'
import {library} from '../publishing/library.mjs'

test('external workspaces discover multilingual and plain Markdown and keep releases independent', t => {
  const parent=resolve(tmpdir()), root=mkdtempSync(join(parent,'folio-discover-'))
  t.after(()=>{assert.equal(dirname(root),parent);rmSync(root,{recursive:true,force:true})})
  for(const dir of ['content','Writer One','Writer Two','Writer One/ja','Writer One/images','Writer One/.obsidian']) mkdirSync(join(root,dir))
  const folder=join(root,'Writer One'), db=library(root,folder)
  writeFileSync(join(folder,'雨.cn.md'),'# 下雨\n')
  writeFileSync(join(folder,'ja/雨.md'),'# 雨の日\n\n![雨](<../images/rain study.png>)')
  writeFileSync(join(folder,'images/rain study.png'),'image fixture')
  writeFileSync(join(folder,'loose note.md'),'Some prose')
  writeFileSync(join(folder,'.obsidian/private.md'),'private')
  const docs=db.list()
  assert.equal(docs.length,3)
  assert.equal(docs.find(d=>d.lang==='und').title,'loose note')
  const ja=docs.find(d=>d.lang==='ja')
  assert.equal(ja.group,docs.find(d=>d.lang==='zh-CN').group)
  assert.equal(db.preview(ja.id).blobs.size,1)
  const plan=db.check([ja.id])
  assert.equal(plan.changes[0].media.length,1)
  db.publish([ja.id],plan.token)
  unlinkSync(join(folder,ja.file))
  assert.equal(db.list().length,2)
  assert.equal(db.current().documents[ja.id].title,'雨の日')
  assert.deepEqual(library(root,join(root,'Writer Two')).current().documents,{})
  for (const name of ['a','b']) writeFileSync(join(folder,name+'.md'),'---\ntranslationKey: rain\nlang: en\n---\n# '+name)
  assert.equal(db.list().filter(d=>d.status==='invalid').length,2)
  writeFileSync(join(folder,'outside.md'),'![secret](../sample.png)')
  assert.equal(db.list().find(d=>d.file==='outside.md').status,'invalid')
})
