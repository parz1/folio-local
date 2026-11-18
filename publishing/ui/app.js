const byId = id => document.getElementById(id)
const states = { draft:'草稿', published:'已发布', modified:'有未发布修改', invalid:'文件需检查' }
const labels = new Map()
let plan, fingerprint = '', selected = [], busy = false, epoch = 0
function element(tag, text, css) {
  const node = document.createElement(tag)
  node.textContent = text
  if (css) node.className = css
  return node
}
async function api(path, data) {
  const response = await fetch('/api/' + path, data ? {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data),
  } : {})
  const result = await response.json()
  if (!response.ok) throw Error(result.error)
  return result
}
function controls() {
  byId('check').disabled = busy || !selected.length
  byId('publish').disabled = busy
  byId('publish').hidden = !plan
}
function reset() {
  plan = undefined
  byId('diff').replaceChildren(element('p','选择译本后，在这里查看正文和图片的变化。','quiet'))
  controls()
}
async function refresh() {
  const request = ++epoch
  const { editions } = await api('status')
  if (request !== epoch || JSON.stringify(editions) === fingerprint) return
  fingerprint = JSON.stringify(editions)
  selected = selected.filter(id => editions.some(e => e.id === id && ['draft','modified'].includes(e.status)))
  reset()
  const rows = editions.map(e => {
    labels.set(e.id,e.label)
    const label = element('label','','row'), box = document.createElement('input')
    box.type='checkbox'; box.value=e.id; box.checked=selected.includes(e.id)
    box.disabled=!['draft','modified'].includes(e.status)
    box.setAttribute('aria-label',e.label)
    box.onchange=() => {
      selected = [...byId('rows').querySelectorAll(':checked')].map(input => input.value)
      byId('notice').textContent=''; reset()
    }
    const name=element('span','')
    name.append(element('strong',e.label),element('small',e.error || e.title))
    label.append(box,name,element('span',states[e.status],'state '+e.status))
    return label
  })
  byId('rows').replaceChildren(...rows)
}
function render(changes) {
  const sections=changes.map(change => {
    const section=element('section','')
    section.append(element('h3',change.label),element('small',change.file))
    for (const hunk of change.hunks) {
      const block=element('div','','hunk')
      block.append(element('code','@@ −'+hunk.oldStart+','+hunk.oldLines+'  +'+hunk.newStart+','+hunk.newLines+' @@','loc'))
      for (const line of hunk.lines)
        block.append(element('code',line,line.startsWith('+')?'add':line.startsWith('-')?'remove':'context'))
      section.append(block)
    }
    for (const asset of change.media)
      section.append(element('p',(asset.before ? asset.after ? '替换图片' : '移除图片' : '新增图片')+' · '+asset.ref,'media'))
    return section
  })
  byId('diff').replaceChildren(...sections)
}
async function action(task) {
  if (busy) return
  busy=true;controls()
  byId('rows').inert=true
  try { await task() } catch (err) { reset();byId('notice').textContent=err.message;await refresh().catch(()=>{}) }
  finally { busy=false;byId('rows').inert=false;controls() }
}
byId('check').onclick=()=>action(async()=>{
  const result=await api('check',{ids:selected})
  plan=result.token;render(result.changes);byId('notice').textContent=''
})
byId('publish').onclick=()=>action(async()=>{
  await api('publish',{ids:selected,token:plan})
  byId('notice').textContent='已发布到本地测试站 · '+selected.map(id=>labels.get(id)).join('、')
  selected=[];reset();await refresh()
})
async function poll() {
  if (!busy) try {await refresh()} catch { byId('notice').textContent='连接中断，请检查本地服务。';reset() }
  setTimeout(poll,2000)
}
poll()
