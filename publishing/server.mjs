import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { escape, library, problem } from './library.mjs'

const {positionals,values} = parseArgs({allowPositionals:true,options:{port:{type:'string'}}})
if (positionals.length>1) throw Error('用法: pnpm open "<Markdown 文件夹>" [--port 4274]')
const folder=positionals[0]
const db=library(fileURLToPath(new URL('../', import.meta.url)),folder)
const host='127.0.0.1', admin=Number(values.port || (folder?4274:4174)), site=admin+1
if (!Number.isInteger(admin)||admin<1||site>65535) throw Error('无效端口')
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
    const preview = /^\/preview\/([a-z0-9-]+)\/(?:assets\/([a-f0-9]{64}\.[a-z]+)|(version))?$/.exec(req.url)
    if (preview) {
      const {document,blobs}=db.preview(preview[1])
      if (preview[3]) return json(res,{version:document.version})
      if (preview[2]) {
        const bytes=blobs.get(preview[2])
        if (!bytes) throw problem('找不到引用图片',404)
        return send(res,types[extname(preview[2])],bytes)
      }
      const html=document.html.replace(/(<img\b[^>]*?\bsrc=")\/assets\//g,'$1./assets/')
      return send(res,'text/html; charset=utf-8','<!doctype html><html lang="'+escape(document.lang)+'"><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><meta name=robots content=noindex><title>'+escape(document.title)+'</title><link rel=stylesheet href=/style.css><script defer src=/preview.js></script><main class="reader" data-version="'+document.version+'"><header><a href="/">工作区</a><span>草稿预览</span></header><article>'+html+'</article></main></html>')
    }
    const routes = { '/preview.js':['preview.js','text/javascript'], '/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css'] }
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
  // Original sample snapshots predate stored language metadata.
  const legacy={zh:['zh-CN','简体中文'],en:['en','English'],ja:['ja','日本語']}
  const editions=Object.entries(documents).map(([id,doc])=>({
    id, lang:doc.lang || legacy[id]?.[0] || 'und', label:doc.label || legacy[id]?.[1] || id
  }))
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
  const menu = editions.filter(e => documents[e.id]).map(e => '<a href="/'+e.id+'/">'+escape(documents[e.id].title)+' · '+escape(e.label)+'</a>').join(' · ')
  const body = doc ? doc.html : '<h1>本地测试站</h1>' + (menu ? '<p>选择一个已发布的译本。</p>' : '<p>还没有已发布的译本。</p>')
  send(res,'text/html; charset=utf-8','<!doctype html><html lang="'+(edition?.lang||'zh-CN')+'"><meta charset=utf-8><meta name=viewport content="width=device-width, initial-scale=1"><meta name=robots content=noindex><title>'+escape(doc?.title||'本地测试站')+'</title><link rel=stylesheet href=/style.css><main class="reader"><header><a href="/">Folio Local</a><nav>'+menu+'</nav></header><article>'+body+'</article></main></html>')
})
console.log('发布工作台 http://'+host+':'+admin+'/\n本地测试站 ' + publicURL + '/')
