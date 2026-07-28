// The 2D "arcade OS" drawn onto the CRT canvas texture. Pure drawing, no React.
import {
  getLeaderboard,
  getFiltered,
  getCapturedAt,
  getArcadeUser,
  getPlatform,
  getBoardTitle,
  type Entry,
} from '../data/leaderboard'
import type { ArcadeState } from '../state'
import { getImage, preload } from './assets'
import { titleLines } from './title'

export const SCREEN_W = 640
export const SCREEN_H = 480

const BG = '#0d0b08'
const AMBER = '#e6dcc4'
const AMBER_DIM = '#8b7f68'
const AMBER_FAINT = '#453d30'
const WHITE = '#f5eeda'
const PURPLE = '#7b6cff'
const PURPLE_LIGHT = '#c3bcff'

const PIXEL = (px: number) => `${px}px "Press Start 2P"`
const TERM = (px: number) => `${px}px "VT323"`

// null means "we could not poll this account", not zero — see LeaderboardEntry.stale
const fmt = (n: number | null): string =>
  n === null ? '—'
  : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M'
  : n >= 1e4 ? Math.round(n / 1e3) + 'K'
  : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K'
  : String(Math.round(n))

// scanlines/vignette/mask live in the CRT shader (Screen.tsx); canvas draws content only
// module-level scroll state, lerped every frame (single screen instance)
let scrollRow = 0
let lastT = 0

export function draw(ctx: CanvasRenderingContext2D, s: ArcadeState, t: number) {
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H)
  ctx.textBaseline = 'alphabetic'

  switch (s.phase) {
    case 'boot':
      drawBoot(ctx, t)
      break
    case 'attract':
      drawAttract(ctx, t)
      break
    case 'leaderboard':
      drawLeaderboard(ctx, s, t)
      break
    case 'detail':
      drawDetail(ctx, s, t)
      break
  }

  // analog static — strong in attract, faint everywhere else
  const specks = s.phase === 'attract' ? 420 : 90
  const alpha = s.phase === 'attract' ? 0.09 : 0.035
  for (let i = 0; i < specks; i++) {
    ctx.fillStyle = `rgba(255,238,200,${Math.random() * alpha})`
    ctx.fillRect(Math.random() * SCREEN_W, Math.random() * SCREEN_H, 2, 2)
  }

  // slow rolling CRT band
  const bandY = ((t * 45) % (SCREEN_H + 140)) - 140
  const band = ctx.createLinearGradient(0, bandY, 0, bandY + 90)
  band.addColorStop(0, 'rgba(255,230,185,0)')
  band.addColorStop(0.5, 'rgba(255,230,185,0.045)')
  band.addColorStop(1, 'rgba(255,230,185,0)')
  ctx.fillStyle = band
  ctx.fillRect(0, bandY, SCREEN_W, 90)
}

// --- boot ---
const BOOT_LINES: Array<[number, string]> = [
  [0.1, 'STANLEY ARCADE SYSTEM'],
  [0.3, 'BIOS V1.0 (C) 2026 STANLEY'],
  [0.55, 'MEM CHECK ......... 65536 KB OK'],
  [0.8, 'CRT PHOSPHOR ...... PAPER'],
  [1.0, 'YAP SENSOR ........ CALIBRATED'],
  [1.2, 'LOADING TOP 100 INDIES'],
]

function drawBoot(ctx: CanvasRenderingContext2D, t: number) {
  ctx.font = TERM(24)
  ctx.textAlign = 'left'
  ctx.fillStyle = AMBER
  let y = 60
  for (const [at, line] of BOOT_LINES) {
    if (t < at) break
    ctx.fillText(line, 40, y)
    y += 34
  }
  if (t > 1.3) {
    const p = Math.min(1, (t - 1.3) / 0.55)
    ctx.strokeStyle = AMBER_DIM
    ctx.strokeRect(40, y - 14, 400, 20)
    ctx.fillStyle = AMBER
    ctx.fillRect(43, y - 11, 394 * p, 14)
  }
  // blinking cursor
  if (Math.floor(t * 3) % 2 === 0) {
    ctx.fillStyle = AMBER
    ctx.fillRect(40, y + 14, 14, 20)
  }
}

// --- attract ---
// warp starfield: depth is a pure function of t, so no per-frame state
const STARS = Array.from({ length: 200 }, () => ({
  x: Math.random() * 2 - 1,
  y: Math.random() * 2 - 1,
  phase: Math.random(),
  speed: 0.3 + Math.random() * 0.4,
}))

// stars render on a low-res layer upscaled with nearest-neighbor for a chunky arcade look
const STAR_PX = 4
const starLayer = document.createElement('canvas')
starLayer.width = SCREEN_W / STAR_PX
starLayer.height = SCREEN_H / STAR_PX
const starCtx = starLayer.getContext('2d')!

function drawStarfield(ctx: CanvasRenderingContext2D, t: number) {
  const w = starLayer.width
  const h = starLayer.height
  const K = h / 2
  starCtx.clearRect(0, 0, w, h)
  for (const s of STARS) {
    const z = 1 - ((t * s.speed + s.phase) % 1)
    const px = w / 2 + (s.x / z) * K
    const py = h / 2 + (s.y / z) * K
    if (px < 0 || px > w || py < 0 || py > h) continue
    const z2 = z + 0.06
    const near = 1 - z
    starCtx.strokeStyle = `rgba(245,238,218,${0.25 + near * 0.65})`
    starCtx.lineWidth = 0.4 + near
    starCtx.beginPath()
    starCtx.moveTo(w / 2 + (s.x / z2) * K, h / 2 + (s.y / z2) * K)
    starCtx.lineTo(px, py)
    starCtx.stroke()
  }
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(starLayer, 0, 0, SCREEN_W, SCREEN_H)
  ctx.imageSmoothingEnabled = true
}

function drawAttract(ctx: CanvasRenderingContext2D, t: number) {
  const entries = getLeaderboard('7d')
  const bounce = Math.sin(t * 1.6) * 10

  drawStarfield(ctx, t)

  ctx.textAlign = 'center'
  const { lines, size } = titleLines(getBoardTitle())
  // the baselines the X board's two-line title has always used; a lone line sits between them
  const ys = lines.length > 1 ? [150, 205] : [178]
  ctx.font = PIXEL(size)
  lines.forEach((line, i) => {
    const y = ys[i] + bounce
    // chromatic fringe on the title
    ctx.fillStyle = 'rgba(255,60,40,0.45)'
    ctx.fillText(line, 318, y)
    ctx.fillStyle = 'rgba(60,120,255,0.35)'
    ctx.fillText(line, 322, y)
    ctx.fillStyle = i === 0 ? WHITE : PURPLE
    ctx.fillText(line, 320, y)
  })

  ctx.font = TERM(24)
  ctx.fillStyle = AMBER_DIM
  ctx.fillText('WHO IS BUILDING THE LOUDEST?', 320, 250 + bounce)

  if (Math.floor(t * 1.6) % 2 === 0) {
    ctx.font = PIXEL(18)
    ctx.fillStyle = WHITE
    ctx.fillText('INSERT COIN', 320, 330)
  }
  ctx.font = TERM(20)
  ctx.fillStyle = AMBER_FAINT
  ctx.fillText('PRESS ENTER OR A', 320, 362)
  const user = getArcadeUser()
  ctx.fillText(user ? `@${user.handle.toUpperCase()} IS ON THE BOARD` : 'J: SEE MY RANK', 320, 388)

  // marquee ticker of the top ranks
  const top = entries.slice(0, 5)
  const text = top.map((e) => `${e.rank}. ${e.name.toUpperCase()} ${fmt(e.impressions)} VIEWS`).join('  ***  ')
  ctx.font = TERM(26)
  const w = ctx.measureText(text).width
  const x = SCREEN_W - ((t * 110) % (w + SCREEN_W))
  ctx.textAlign = 'left'
  ctx.fillStyle = AMBER
  ctx.fillRect(0, 408, SCREEN_W, 2)
  ctx.fillText(text, x, 442)
  ctx.fillRect(0, 458, SCREEN_W, 2)
}

// --- leaderboard ---
// 10 rows, not 11: the 11th used to end at y=412 with only 18px to the footer text, and the
// pinned "my rank" row needs a whole row of clearance. Everything else here derives from it.
const VISIBLE_ROWS = 10
const ROW_H = 28
const LIST_TOP = 126
const PIN_RULE_Y = 394
const PIN_ROW_Y = 418

function drawHeader(ctx: CanvasRenderingContext2D, s: ArcadeState, title: string) {
  ctx.font = PIXEL(14)
  ctx.textAlign = 'left'
  ctx.fillStyle = AMBER
  ctx.fillText(title, 24, 42)

  // 7D / 30D tabs
  for (const [i, win] of (['7d', '30d'] as const).entries()) {
    const x = 500 + i * 64
    const active = s.win === win
    if (active) {
      ctx.fillStyle = PURPLE
      ctx.fillRect(x - 6, 24, 58, 26)
    }
    ctx.font = PIXEL(12)
    ctx.fillStyle = active ? '#ffffff' : AMBER_DIM
    ctx.fillText(win.toUpperCase(), x, 43)
  }
  ctx.fillStyle = AMBER_FAINT
  ctx.fillRect(24, 58, SCREEN_W - 48, 2)
}

// One board row. Shared by the scrolling list and the pinned "my rank" row, which is the
// only reason it's a function — the pin has to be visually identical to the row it stands in for.
function drawRow(ctx: CanvasRenderingContext2D, e: Entry, y: number, selected: boolean, isMe: boolean) {
  if (selected) {
    ctx.fillStyle = PURPLE
    ctx.fillRect(16, y - 20, SCREEN_W - 32, ROW_H - 2)
  } else if (isMe) {
    // inset 1px from the selection fill so the 2px stroke stays inside the row footprint
    ctx.strokeStyle = PURPLE
    ctx.lineWidth = 2
    ctx.strokeRect(17, y - 19, SCREEN_W - 34, ROW_H - 4)
  }
  // rank, not list position: under a search filter the top three *results* aren't the top three
  const fg = selected ? '#ffffff' : isMe ? PURPLE_LIGHT : e.rank >= 1 && e.rank <= 3 ? WHITE : AMBER
  ctx.fillStyle = fg
  ctx.font = TERM(24)
  ctx.textAlign = 'right'
  ctx.fillText(e.rank ? String(e.rank) : '—', 64, y)
  // rank delta glyph
  if (e.rankDelta !== 0) {
    ctx.font = TERM(20)
    ctx.fillStyle = selected ? '#ffffff' : e.rankDelta > 0 ? WHITE : AMBER_DIM
    ctx.textAlign = 'left'
    ctx.fillText(e.rankDelta > 0 ? '^' + e.rankDelta : 'v' + -e.rankDelta, 76, y)
  }
  // Builder cell: name, then a dimmer, smaller @handle right after it — no handle column, the
  // two belong together. Clipped at 540 rather than character-counted, because IMPRESSIONS is
  // right-aligned at 616 and its widest value starts around there.
  ctx.save()
  ctx.beginPath()
  ctx.rect(130, y - 20, 410, ROW_H - 2)
  ctx.clip()
  ctx.font = TERM(24)
  ctx.fillStyle = fg
  ctx.textAlign = 'left'
  const name = (selected ? '> ' : '') + e.name.toUpperCase().slice(0, 20)
  ctx.fillText(name, 130, y)
  const nameW = ctx.measureText(name).width // measure in TERM(24), before switching fonts
  ctx.font = TERM(20)
  ctx.fillStyle = selected ? PURPLE_LIGHT : AMBER_DIM
  ctx.fillText('@' + e.handle, 130 + nameW + 10, y)
  ctx.restore()

  ctx.font = TERM(24)
  ctx.fillStyle = fg
  ctx.textAlign = 'right'
  ctx.fillText(fmt(e.stale ? null : e.impressions), 616, y)
}

function drawLeaderboard(ctx: CanvasRenderingContext2D, s: ArcadeState, t: number) {
  const entries = getFiltered(s.win, s.query)
  // ponytail: a fixed label per board, not the event's own name — the header
  // has ~33 chars of Press Start 2P before it runs into the 7D/30D tabs, and
  // real challenge names ("Build In Public 14-Day Challenge") overflow it.
  // The specific name lives in the share copy and the browser title instead.
  const title =
    s.query === null
      ? getPlatform() === 'threads'
        ? 'BUILD IN PUBLIC'
        : 'TOP 100 INDIES'
      : 'FIND: ' + s.query.toUpperCase().slice(0, 18) + (Math.floor(t * 3) % 2 === 0 ? '_' : '')
  drawHeader(ctx, s, title)

  ctx.font = TERM(20)
  ctx.textAlign = 'right'
  ctx.fillStyle = AMBER_DIM
  ctx.fillText('RANK', 64, 96)
  ctx.textAlign = 'left'
  ctx.fillText('BUILDER', 130, 96)
  ctx.textAlign = 'right'
  ctx.fillText(getPlatform() === 'threads' ? 'VIEWS' : 'IMPRESSIONS', 616, 96)

  // keep cursor inside the window with a 2-row margin, lerp toward it (frame-rate independent)
  const dt = Math.min(Math.max(t - lastT, 0), 0.1)
  lastT = t
  const target = Math.max(0, Math.min(s.cursor - 5, entries.length - VISIBLE_ROWS))
  scrollRow += (target - scrollRow) * (1 - Math.exp(-11 * dt))
  if (Math.abs(target - scrollRow) < 0.01) scrollRow = target

  const me = getArcadeUser()?.handle.toLowerCase()
  const first = Math.floor(scrollRow)
  const offset = (scrollRow - first) * ROW_H
  for (let i = first; i < Math.min(first + VISIBLE_ROWS + 1, entries.length); i++) {
    const e = entries[i]
    preload(e.avatar)
    const y = LIST_TOP + (i - first) * ROW_H - offset
    if (y < LIST_TOP - ROW_H || y > LIST_TOP + (VISIBLE_ROWS - 1) * ROW_H + 8) continue
    drawRow(ctx, e, y, i === s.cursor, e.handle.toLowerCase() === me)
  }

  // Your own row, parked above the footer once you've scrolled away from it. The bounds test uses
  // the raw lerped scrollRow, so it's exact at rest. getFiltered means a query that excludes you
  // drops the pin too — pinning a row that isn't in the list you're reading would be a lie.
  const myIdx = me ? entries.findIndex((e) => e.handle.toLowerCase() === me) : -1
  if (myIdx >= 0 && (myIdx < scrollRow || myIdx > scrollRow + VISIBLE_ROWS - 1)) {
    ctx.fillStyle = AMBER_FAINT
    ctx.fillRect(24, PIN_RULE_Y, SCREEN_W - 48, 2)
    drawRow(ctx, entries[myIdx], PIN_ROW_Y, false, true)
  }

  if (entries.length === 0) {
    ctx.font = TERM(24)
    ctx.textAlign = 'center'
    ctx.fillStyle = AMBER_DIM
    ctx.fillText('NO RESULTS', 320, 260)
  } else {
    // scrollbar
    const barH = (VISIBLE_ROWS / entries.length) * (VISIBLE_ROWS * ROW_H)
    const barY = LIST_TOP - 20 + (scrollRow / entries.length) * (VISIBLE_ROWS * ROW_H)
    ctx.fillStyle = AMBER_FAINT
    ctx.fillRect(628, barY, 4, Math.max(barH, 12))
  }

  const footer =
    s.query !== null
      ? 'TYPE TO FILTER   ESC:CLEAR'
      : getArcadeUser()
        ? 'A:SELECT   B:BACK   /:FIND'
        : 'A:SELECT   B:BACK   J:MY RANK   /:FIND'
  drawFooter(ctx, footer, t)
}

// --- detail ---
function drawDetail(ctx: CanvasRenderingContext2D, s: ArcadeState, t: number) {
  const entries = getFiltered(s.win, s.query)
  const e: Entry | undefined = entries[Math.min(s.cursor, entries.length - 1)]
  if (!e) return
  drawHeader(ctx, s, e.rank ? `RANK #${e.rank}` : 'UNRANKED')
  preload(entries[s.cursor + 1]?.avatar ?? null)
  preload(entries[s.cursor - 1]?.avatar ?? null)

  // avatar, pixelated
  const img = getImage(e.avatar)
  const ax = 40
  const ay = 96
  const size = 112
  if (img) {
    ctx.imageSmoothingEnabled = false
    // downsample hard for the retro look
    ctx.drawImage(img, ax, ay, size, size)
    ctx.imageSmoothingEnabled = true
  } else {
    ctx.fillStyle = AMBER_FAINT
    ctx.fillRect(ax, ay, size, size)
  }
  ctx.strokeStyle = AMBER_DIM
  ctx.lineWidth = 2
  ctx.strokeRect(ax - 3, ay - 3, size + 6, size + 6)

  ctx.textAlign = 'left'
  ctx.font = PIXEL(16)
  ctx.fillStyle = WHITE
  ctx.fillText(e.name.toUpperCase().slice(0, 22), 180, 124)
  ctx.font = TERM(24)
  ctx.fillStyle = AMBER
  ctx.fillText('@' + e.handle, 180, 152)
  ctx.fillStyle = AMBER_DIM
  const prod = (e.product || e.companyName).toUpperCase()
  ctx.fillText(prod.length > 30 ? prod.slice(0, 29) + '…' : prod, 180, 180)

  // one-line human blurb, wrapped beside the avatar
  if (e.blurb) {
    ctx.font = TERM(20)
    ctx.fillStyle = AMBER
    wrapText(ctx, e.blurb.toUpperCase(), 180, 206, SCREEN_W - 180 - 24, 22, 3)
  }

  // stat grid
  // Followers comes from the profile lookup, so it survives an unpollable timeline.
  const win = (n: number) => (e.stale ? null : n);
  // A challenge board only has the three figures the leaderboard query
  // returns — no follower count, no yap score, no rank history to trend
  // against — so it fills the top row of the grid and leaves the second
  // empty rather than drawing zeros as if they meant something.
  const threads = getPlatform() === 'threads'
  const stats: Array<[string, string]> = threads
    ? [
        ['VIEWS', fmt(e.impressions)],
        ['POSTS', fmt(e.postsTotal)],
        ['RANK', '#' + e.rank],
      ]
    : [
        ['FOLLOWERS', fmt(e.followers)],
        ['POSTS ' + s.win.toUpperCase(), fmt(win(e.postsTotal))],
        ['YAP SCORE', fmt(win(e.yapScore))],
        ['INTERACTIONS', fmt(win(e.interactions))],
        ['IMPRESSIONS', fmt(win(e.impressions))],
        ['TREND', e.rankDelta === 0 ? '=' : e.rankDelta > 0 ? `UP ${e.rankDelta}` : `DOWN ${-e.rankDelta}`],
      ]
  // The headline figure gets the white treatment: yap score ranks the X
  // board, views rank a challenge.
  const hero = threads ? 0 : 2
  const gx = [40, 250, 460]
  const gy = [268, 340]
  ctx.textAlign = 'left'
  for (const [i, [label, value]] of stats.entries()) {
    const x = gx[i % 3]
    const y = gy[Math.floor(i / 3)]
    ctx.font = TERM(20)
    ctx.fillStyle = AMBER_FAINT
    ctx.fillText(label, x, y)
    ctx.font = PIXEL(16)
    ctx.fillStyle = i === hero ? WHITE : AMBER
    ctx.fillText(value, x, y + 30)
  }

  if (Math.floor(t * 1.6) % 2 === 0) {
    ctx.font = PIXEL(13)
    ctx.textAlign = 'center'
    ctx.fillStyle = WHITE
    ctx.fillText('A: VIEW @' + e.handle.toUpperCase() + (threads ? ' ON THREADS' : ' ON X'), 320, 412)
  }
  drawFooter(ctx, 'B:BACK   ^/v:PREV-NEXT', t)
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/)
  let line = ''
  let lines = 0
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (line && ctx.measureText(test).width > maxWidth) {
      lines++
      if (lines === maxLines) {
        ctx.fillText(line + '…', x, y)
        return
      }
      ctx.fillText(line, x, y)
      y += lineHeight
      line = word
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, y)
}

function drawFooter(ctx: CanvasRenderingContext2D, text: string, _t: number) {
  ctx.font = TERM(20)
  ctx.textAlign = 'center'
  ctx.fillStyle = AMBER_FAINT
  ctx.fillText(text, 320, 452)
  ctx.textAlign = 'left'
  // Challenge boards have no snapshot date to show, and a bare "DATA" reads
  // like a broken label — draw the stamp only when there is one.
  const captured = getCapturedAt().slice(0, 10)
  if (captured) ctx.fillText('DATA ' + captured, 24, 452)
}
