import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import MarkdownIt from 'markdown-it'
import { structuredPatch } from 'diff'
import { parse } from 'yaml'

export const editions = [
  { id: 'zh', label: '简体中文', lang: 'zh-CN', file: 'index.md' },
  { id: 'en', label: 'English', lang: 'en', file: 'en/index.md' },
  { id: 'ja', label: '日本語', lang: 'ja', file: 'ja/index.md' },
]
export const escape = value => String(value).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const md = new MarkdownIt({ html: false })
const image = md.renderer.rules.image
md.renderer.rules.image = (tokens, i, options, env, self) => {
  const token = tokens[i]
  token.attrSet('src', env.asset(token.attrGet('src')))
  return image(tokens, i, options, env, self)
}
export function problem(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

export function library(root) {
  const content = realpathSync(join(root, 'content'))
  const state = join(root, '.folio-local')
  const pointer = join(state, 'published.json')
  const key = randomBytes(32)
  const current = () => existsSync(pointer)
    ? JSON.parse(readFileSync(pointer, 'utf8'))
    : { generation: 0, documents: {} }

  function draft(edition) {
    const file = realpathSync(join(content, edition.file))
    if (!file.startsWith(content + sep)) throw problem('文稿超出内容目录')
    const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    const header = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(source)
    const meta = header && parse(header[1])
    if (typeof meta?.title !== 'string' || !meta.title.trim()) throw problem('文稿需要 title')
    const assets = {}, blobs = new Map()
    const html = md.render(source.slice(header[0].length), {
      asset(ref) {
        const name = decodeURIComponent(ref)
        if (/^[a-z]+:|^[\\/]|[?#]/i.test(name)) throw problem('图片须引用 content/assets 中的本地文件')
        const path = realpathSync(resolve(dirname(file), name))
        if (!path.startsWith(join(content, 'assets') + sep)) throw problem('图片超出素材目录')
        const ext = extname(path).toLowerCase()
        if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) throw problem('不支持的图片格式')
        const bytes = readFileSync(path), id = hash(bytes) + ext
        blobs.set(id, bytes)
        assets[ref] = id
        return '/assets/' + id
      },
    })
    const version = hash(JSON.stringify([source, assets]))
    return { document: { title: meta.title, source, html, assets, version }, blobs }
  }
  function list() {
    const live = current()
    return editions.map(e => {
      const published = live.documents[e.id]
      try {
        const { document } = draft(e)
        return { ...e, title: document.title, status: !published ? 'draft' :
          published.version === document.version ? 'published' : 'modified' }
      } catch (err) {
        return { ...e, status: 'invalid', error: err.status ? err.message : '请检查 Markdown、元数据和图片路径' }
      }
    })
  }
  function prepare(ids) {
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length ||
        !ids.every(id => editions.some(e => e.id === id))) throw problem('请选择有效译本')
    const live = current(), documents = { ...live.documents }, changes = [], blobs = new Map()
    for (const edition of editions.filter(e => ids.includes(e.id))) {
      const old = live.documents[edition.id]
      const next = draft(edition), doc = next.document
      if (old?.version === doc.version) throw problem('所选译本已发布，请重新选择', 409)
      const patch = structuredPatch('', '', old?.source || '', doc.source, '', '', { context: 3 })
      const refs = new Set([...Object.keys(old?.assets || {}), ...Object.keys(doc.assets)])
      changes.push({ id: edition.id, label: edition.label, file: edition.file,
        hunks: patch.hunks, media: [...refs].filter(ref => old?.assets[ref] !== doc.assets[ref])
          .map(ref => ({ ref, before: old?.assets[ref], after: doc.assets[ref] })) })
      documents[edition.id] = doc
      for (const [id, bytes] of next.blobs) blobs.set(id, bytes)
    }
    const token = createHmac('sha256', key)
      .update(JSON.stringify([live.generation, changes.map(c => [c.id, documents[c.id].version])])).digest('hex')
    return { changes, token, blobs, documents, generation: live.generation + 1 }
  }
  function check(ids) {
    const { changes, token } = prepare(ids)
    return { changes, token }
  }
  function publish(ids, token) {
    const next = prepare(ids)
    if (next.token !== token) throw problem('文稿、图片或测试站版本已变化，请重新查看差异', 409)
    mkdirSync(join(state, 'assets'), { recursive: true })
    for (const [id, bytes] of next.blobs) {
      const dest = join(state, 'assets', id)
      if (!existsSync(dest)) writeFileSync(dest, bytes, { flag: 'wx' })
      else if (hash(readFileSync(dest)) !== hash(bytes)) writeFileSync(dest, bytes)
    }
    const temp = pointer + '.' + randomUUID()
    writeFileSync(temp, JSON.stringify({ generation: next.generation, documents: next.documents }), { flag: 'wx' })
    renameSync(temp, pointer)
    return { generation: next.generation }
  }
  return { list, current, check, publish, state }
}
