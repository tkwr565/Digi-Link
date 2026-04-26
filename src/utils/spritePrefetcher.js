import { loadDigimonDb, getSpriteUrl } from './digimonUtils'

const PREFETCH_KEY = 'digimon_sprites_prefetched_v1'
const BATCH_SIZE = 40

function loadImage(url) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = resolve
    img.onerror = resolve // don't block on missing sprites
    img.src = url
  })
}

export async function prefetchAllSprites() {
  if (localStorage.getItem(PREFETCH_KEY)) return

  const db = await loadDigimonDb()
  if (!db || db.length === 0) return

  const urls = db.flatMap(({ suffix }) => [
    getSpriteUrl(suffix, 0),
    getSpriteUrl(suffix, 1),
  ])

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    await Promise.all(urls.slice(i, i + BATCH_SIZE).map(loadImage))
  }

  localStorage.setItem(PREFETCH_KEY, '1')
}
