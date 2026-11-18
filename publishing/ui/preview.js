const version = document.querySelector('main').dataset.version
async function refresh() {
  try {
    const response = await fetch('./version', {cache:'no-store'})
    if (response.ok && (await response.json()).version !== version) {
      location.reload()
      return
    }
  } catch { /* Keep the last rendered page while the file is being saved. */ }
  setTimeout(refresh,1500)
}
setTimeout(refresh,1500)
