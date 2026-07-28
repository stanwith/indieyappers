import type { Platform } from '@/lib/links'

export type StatWindow = '7d' | '30d'

export interface Entry {
  rank: number
  handle: string
  name: string
  product: string
  companyName: string
  blurb: string | null
  followers: number
  postsTotal: number
  yapScore: number
  interactions: number
  impressions: number
  rankDelta: number
  avatar: string | null
  /** Could not be polled, so rank is 0 and the figures draw as "—". */
  stale: boolean
}

export interface ArcadeUser {
  handle: string
  avatarUrl: string | null
}

export interface ArcadeData {
  capturedAt: string
  windows: Record<StatWindow, Entry[]>
  /** Null on every board without its own sign-in (the Threads challenge
   *  boards). That alone switches off the pinned "my rank" row, the attract
   *  screen's "you're on the board" line and the post-auth toast. */
  user: ArcadeUser | null
  platform: Platform
  /** Where "SEE MY RANK" and the J key go — a Stanley event landing page. */
  seeMyRankUrl: string
  /** Human name of this board, used in share copy. */
  boardTitle: string
}

// Hydrated from the server page before first render. Everything downstream
// (reducer, canvas draw loop, overlay) reads it synchronously, so it lives in
// module state instead of React state.
let data: ArcadeData = {
  capturedAt: '',
  windows: { '7d': [], '30d': [] },
  user: null,
  platform: 'x',
  seeMyRankUrl: '',
  boardTitle: '',
}

export function setArcadeData(d: ArcadeData) {
  data = d
  filterKey = null
}

export function getLeaderboard(win: StatWindow): Entry[] {
  return data.windows[win]
}

// getFiltered runs in the CRT draw loop (every frame) — memoize the last
// (win, query) so an unchanged search doesn't re-filter 100 entries at 60fps
let filterKey: string | null = null
let filterResult: Entry[] = []

// same predicate as the /v1 board's search (YapperBoard)
export function getFiltered(win: StatWindow, query: string | null): Entry[] {
  const q = (query ?? '').trim().toLowerCase().replace(/^@/, '')
  if (!q) return data.windows[win]
  const key = win + '\0' + q
  if (key !== filterKey) {
    filterKey = key
    filterResult = data.windows[win].filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.handle.toLowerCase().includes(q) ||
        e.companyName.toLowerCase().includes(q),
    )
  }
  return filterResult
}

export function getCapturedAt(): string {
  return data.capturedAt
}

export function getArcadeUser(): ArcadeUser | null {
  return data.user
}

// Read from the module store rather than threaded as props: the canvas draw
// loop and the send() callback are outside React's data flow, and a prop read
// in either would be a stale closure waiting to happen.
export function getPlatform(): Platform {
  return data.platform
}

export function getBoardTitle(): string {
  return data.boardTitle
}
