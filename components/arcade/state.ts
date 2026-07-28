import { getFiltered, type StatWindow } from './data/leaderboard'

export type Phase = 'boot' | 'attract' | 'leaderboard' | 'detail'

// where the camera is standing. Not arcade state — the reducer never sees it.
export type View = 'room' | 'play' | 'poster'

export interface ArcadeState {
  phase: Phase
  win: StatWindow
  cursor: number
  // null = not searching, '' = search mode with empty query
  query: string | null
}

export type Action =
  | { t: 'BOOT_DONE' }
  | { t: 'COIN' }
  | { t: 'MOVE'; dir: 1 | -1 }
  | { t: 'SELECT' }
  | { t: 'BACK' }
  | { t: 'TOGGLE_WINDOW' }
  | { t: 'SEARCH'; q: string | null }

export const initialState: ArcadeState = { phase: 'boot', win: '7d', cursor: 0, query: null }

// lets the 3D controls animate on every action regardless of input source (keys/touch/raycast)
export const feedback: { handler?: (a: Action) => void } = {}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Pure. Side effects (sound, window.open) live in App's dispatch wrapper.
export function reduce(s: ArcadeState, a: Action): ArcadeState {
  const count = getFiltered(s.win, s.query).length
  const otherWin = s.win === '7d' ? '30d' : '7d'
  switch (s.phase) {
    case 'boot':
      return a.t === 'BOOT_DONE' ? { ...s, phase: 'attract' } : s
    case 'attract':
      return a.t === 'COIN' || a.t === 'SELECT' ? { ...s, phase: 'leaderboard' } : s
    case 'leaderboard':
      switch (a.t) {
        case 'MOVE':
          return { ...s, cursor: clamp(s.cursor + a.dir, 0, Math.max(0, count - 1)) }
        case 'SELECT':
          return count === 0 ? s : { ...s, phase: 'detail' }
        case 'BACK':
          // first Esc/B clears the search, second leaves the board
          if (s.query !== null) return { ...s, query: null, cursor: 0 }
          return { ...s, phase: 'attract', cursor: 0 }
        case 'TOGGLE_WINDOW':
          return { ...s, win: otherWin, cursor: clamp(s.cursor, 0, Math.max(0, getFiltered(otherWin, s.query).length - 1)) }
        case 'SEARCH':
          return { ...s, query: a.q, cursor: 0 }
        default:
          return s
      }
    case 'detail':
      switch (a.t) {
        case 'MOVE':
          return { ...s, cursor: clamp(s.cursor + a.dir, 0, Math.max(0, count - 1)) }
        case 'BACK':
          return { ...s, phase: 'leaderboard' }
        case 'TOGGLE_WINDOW':
          return { ...s, win: otherWin, cursor: clamp(s.cursor, 0, Math.max(0, getFiltered(otherWin, s.query).length - 1)) }
        default:
          return s
      }
  }
}
