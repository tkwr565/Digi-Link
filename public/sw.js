const CACHE_NAME = 'sprites-v1'
const BUNDLE_URL = '/sprites/bundle_v1.bin'
const MARKER_URL = '/_sprites_ready'

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(loadBundle())
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { pathname } = new URL(event.request.url)
  if (!pathname.startsWith('/sprites/') || pathname === BUNDLE_URL) return
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  )
})

async function loadBundle() {
  try {
    const cache = await caches.open(CACHE_NAME)
    if (await cache.match(new URL(MARKER_URL, self.location.origin).href)) return

    const resp = await fetch(BUNDLE_URL)
    if (!resp.ok) throw new Error(`Bundle fetch failed: ${resp.status}`)

    const buffer = await resp.arrayBuffer()
    const view = new DataView(buffer)
    const decoder = new TextDecoder()
    let offset = 0

    const count = view.getUint32(offset, true)
    offset += 4

    const batch = []
    for (let i = 0; i < count; i++) {
      const pathLen = view.getUint16(offset, true)
      offset += 2
      const filePath = decoder.decode(new Uint8Array(buffer, offset, pathLen))
      offset += pathLen
      const dataLen = view.getUint32(offset, true)
      offset += 4
      const png = buffer.slice(offset, offset + dataLen)
      offset += dataLen

      const url = new URL(`/sprites/${filePath}`, self.location.origin).href
      batch.push(
        cache.put(url, new Response(new Blob([png], { type: 'image/png' }), {
          headers: { 'Content-Type': 'image/png' }
        }))
      )

      if (batch.length >= 200) await Promise.all(batch.splice(0))
    }
    await Promise.all(batch)
    await cache.put(new URL(MARKER_URL, self.location.origin).href, new Response('done'))
  } catch (err) {
    console.error('[SW] Bundle load failed, will retry next install:', err)
  }
}
