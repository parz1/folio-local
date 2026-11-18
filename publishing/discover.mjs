import { readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { createHash } from 'node:crypto'
import { parse } from 'yaml'

const languages = new Intl.DisplayNames(['zh-CN'], {type:'language', fallback:'none'})
function locale(value) {
  if (value === 'cn') return 'zh-CN'
  if (typeof value !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value)) return null
  try {
    const tag = Intl.getCanonicalLocales(value)[0]
    return languages.of(tag) ? tag : null
  } catch { return null }
}
export function markdown(source, filename) {
  const text = source.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n')
  const header = /^---[ \t]*\n([\s\S]*?)^---[ \t]*(?:\n|$)/m.exec(text)
  if (/^---[ \t]*\n/.test(text) && (!header || header.index !== 0)) throw Error('frontmatter')
  const hasHeader = header?.index === 0
  const meta = hasHeader ? parse(header[1]) || {} : {}
  const body = hasHeader ? text.slice(header[0].length) : text
  const title = meta.title || /^#\s+(.+?)\s*$/m.exec(body)?.[1] || posix.basename(filename).replace(/\.md$/i,'')
  if (typeof title !== 'string' || !title.trim()) throw Error('title')
  return {source:text, meta, body, title}
}
export function discover(content, sample = false) {
  const files = []
  function scan(dir) {
    for (const item of readdirSync(join(content,dir),{withFileTypes:true})) {
      if (item.name.startsWith('.') || item.name === 'node_modules' || item.isSymbolicLink()) continue
      const path = posix.join(dir,item.name)
      if (item.isDirectory()) scan(path)
      else if (item.isFile() && /\.md$/i.test(path)) files.push(path)
    }
  }
  scan('')
  const rows = files.sort().map(file => {
    try {
      const { meta, title } = markdown(readFileSync(join(content,file),'utf8'),file)
      const parts = file.replace(/\.md$/i,'').split('/')
      const stem = parts.pop()
      const suffix = /^(.*)\.([^.]+)$/.exec(stem)
      const suffixLang = suffix && locale(suffix[2])
      const dirIndex = parts.findIndex(p => locale(p))
      const dirLang = dirIndex >= 0 ? locale(parts[dirIndex]) : null
      if (dirLang) parts.splice(dirIndex,1)
      const lang = locale(meta.lang) || suffixLang || dirLang || 'und'
      if (meta.lang && !locale(meta.lang)) throw Error('lang')
      const group = meta.translationKey ?? [...parts,suffixLang?suffix[1]:stem].join('/')
      if (typeof group !== 'string' || !group.trim()) throw Error('translationKey')
      const legacy = sample && ({'index.md':'zh','en/index.md':'en','ja/index.md':'ja'})[file]
      const id = legacy || 'doc-'+createHash('sha256').update(JSON.stringify([group,lang])).digest('hex').slice(0,24)
      const label = ({'zh-CN':'简体中文',en:'English',ja:'日本語',und:'未标注语言'})[lang] || languages.of(lang)
      return { file, id, lang, label, group, title }
    } catch { return {file, group:file, label:file, error:'请检查 Markdown 的 frontmatter、lang 和 translationKey'} }
  })
  const seen = new Map()
  for (const row of rows.filter(r=>r.id)) {
    const previous=seen.get(row.id)
    if(previous) previous.error=row.error='同一篇文章的语言重复，请检查路径或 translationKey'
    seen.set(row.id,row)
  }
  return rows.sort((a,b)=>a.group.localeCompare(b.group) || Number(b.id==='zh')-Number(a.id==='zh') || a.file.localeCompare(b.file))
}
