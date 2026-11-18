import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { editions, escape, library, problem } from './library.mjs'

const db = library(fileURLToPath(new URL('../', import.meta.url)))
const host = '127.0.0.1', admin = 4174, site = 4175
const publicURL = 'http://' + host + ':' + site
const ui = name => readFileSync(new URL('./ui/' + name, import.meta.url))
const types = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp' }
function send(res, type, body, status = 200) {
  res.writeHead(status, { 'Content-Type':type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'" })
  res.end(body)
}
const json = (res, value, status) => send(res, 'application/json; charset=utf-8', JSON.stringify(value), status)
async function input(req) {
  const chunks = []; let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 4096) throw problem('请求过大', 413)
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks)) } catch { throw problem('无效请求') }
}
function listen(port, handler) {
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.host !== host + ':' + port) throw problem('请求来源无效', 403)
      await handler(req, res)
    } catch (err) {
      json(res, { error: err.status ? err.message : '读取失败，请检查本地文件后重试' }, err.status || 500)
    }
  })
  server.on('error', err => { console.error('无法启动本地服务', port, err.code); process.exit(1) })
  server.listen(port, host)
}
listen(admin, async (req, res) => {
  if (req.method === 'GET') {
    if (req.url === '/api/status') return json(res, { editions: db.list(), site: publicURL })
    const routes = { '/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css'] }
    const file = Object.hasOwn(routes,req.url) && routes[req.url]
    if (file) return send(res, file[1] + '; charset=utf-8', ui(file[0]))
  }
  if (req.method === 'POST' && ['/api/check','/api/publish'].includes(req.url)) {
    if (req.headers.origin !== 'http://' + host + ':' + admin || req.headers['content-type'] !== 'application/json') throw problem('请求来源无效', 403)
    const data = await input(req)
    return json(res, req.url === '/api/check' ? db.check(data?.ids) : db.publish(data?.ids, data?.token))
  }
  throw problem('页面不存在', 404)
})
listen(site, (req, res) => {
  if (req.method !== 'GET') throw problem('只读站点', 405)
  const { generation, documents } = db.current()
  if (req.url === '/api/v1/published') {
    const etag = '"published-' + generation + '"'
    res.setHeader('ETag', etag)
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { 'Cache-Control': 'no-cache' })
      return res.end()
    }
    return json(res, {
      schemaVersion: 1, generation,
      editions: editions.filter(e => documents[e.id]).map(({ id, lang, label }) => {
        const { title, html, version, assets } = documents[id]
        return { id, lang, label, title, html, version, images: [...new Set(Object.values(assets))] }
      }),
    })
  }
  if (req.url === '/style.css') return send(res, 'text/css', ui('style.css'))
  if (/^\/assets\/[0-9a-f]{64}\.(png|jpe?g|webp|gif)$/.test(req.url)) {
    const id = req.url.slice(8)
    if (Object.values(documents).some(d => Object.values(d.assets).includes(id)))
      return send(res, types[extname(id)], readFileSync(join(db.state,'assets',id)))
  }
  const edition = editions.find(e => req.url === '/' + e.id + '/')
  const doc = edition && documents[edition.id]
  if (req.url !== '/' && !doc) throw problem('这个版本尚未发布', 404)
  const menu = editions.filter(e => documents[e.id]).map(e => '<a href="/'+e.id+'/">'+escape(e.label)+'</a>').join(' · ')
  const body = doc ? doc.html : '<h1>本地测试站</h1>' + (menu ? '<p>选择一个已发布的译本。</p>' : '<p>还没有已发布的译本。</p>')
  send(res,'text/html; charset=utf-8','<!doctype html><html lang="'+(edition?.lang||'zh-CN')+'"><meta charset=utf-8><meta name=viewport content="width=device-width, initial-scale=1"><meta name=robots content=noindex><title>'+escape(doc?.title||'本地测试站')+'</title><link rel=stylesheet href=/style.css><main class="reader"><header><a href="/">Folio Local</a><nav>'+menu+'</nav></header><article>'+body+'</article></main></html>')
})
console.log('发布工作台 http://127.0.0.1:4174/\n本地测试站 ' + publicURL + '/')
