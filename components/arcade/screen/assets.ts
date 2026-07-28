// Lazy Image cache for avatars/logos. Remote images (sign-up avatars on
// pbs.twimg.com) must load with CORS or they'd taint the CRT canvas and break
// its getImageData-based light sampling; on failure getImage stays null and
// the placeholder path draws instead.
const cache = new Map<string, HTMLImageElement>()

export function getImage(src: string | null): HTMLImageElement | null {
  if (!src) return null
  let img = cache.get(src)
  if (!img) {
    img = new Image()
    if (/^https?:/.test(src)) img.crossOrigin = 'anonymous'
    img.src = src
    cache.set(src, img)
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}

export function preload(src: string | null) {
  if (src && !cache.has(src)) getImage(src)
}
