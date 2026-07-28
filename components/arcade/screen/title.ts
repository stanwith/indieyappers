// Laying out the attract screen's big title. Its own module, DOM-free, because render.ts
// touches document at import time (the starfield layer) and so can't be imported by a test.

// Press Start 2P is monospaced at 1em per glyph, so a line's width is character count times
// font size. That means no measureText, hence no canvas — and hence this is testable.
// ponytail: only true for Press Start 2P. Anything else on this screen must measure.
const SCREEN_TITLE_W = 560 // of 640, leaving a margin either side
const MAX_PX = 36 // the size the X board's two-line title has always drawn at
const MIN_PX = 14 // below this the pixel font stops reading as a title

/** Balances `raw` over at most two lines and picks the largest size that still fits. */
export function titleLines(raw: string): { lines: string[]; size: number } {
  const text = raw.trim().toUpperCase().replace(/\s+/g, ' ')
  // Break at the last space at or before the midpoint, so the lines come out even rather than
  // one long and one stub: "TOP 100 INDIES" → TOP 100 / INDIES. A first word that already
  // crosses the midpoint breaks at the first space instead, rather than not wrapping at all.
  const mid = text.lastIndexOf(' ', text.length / 2)
  const at = mid < 0 ? text.indexOf(' ') : mid
  const lines = at < 0 ? [text] : [text.slice(0, at), text.slice(at + 1)]

  const longest = Math.max(...lines.map((l) => l.length))
  return { lines, size: Math.max(MIN_PX, Math.min(MAX_PX, Math.floor(SCREEN_TITLE_W / longest))) }
}
