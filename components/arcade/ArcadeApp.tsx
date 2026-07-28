'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { reduce, initialState, feedback, type Action, type View } from './state'
import { getFiltered, getPlatform, setArcadeData, type ArcadeData } from './data/leaderboard'
import { play, startMusic, toggleMute } from './sound'
import { FrontalScene, POSTER_COUNT } from './scene/FrontalScene'
import { Overlay } from './ui/Overlay'
// Joining is gated behind a Stanley conversation (same funnel as v1's
// "Message Stanley"): Stanley hands out the /join OAuth URL on the other side.
// Which Stanley page depends on the board, so the URL arrives in the data.
import { profileUrl } from '@/lib/links'

export interface ArcadeAuth {
  status: 'ok' | 'failed'
  rank: number | null
  total: number
}

export interface ArcadeProps {
  data: ArcadeData
  auth: ArcadeAuth | null
}

export default function ArcadeApp({ data, auth }: ArcadeProps) {
  // hydrate the module store before anything below renders — the reducer,
  // canvas draw loop and overlay all read it synchronously
  setArcadeData(data)

  const [ready, setReady] = useState(false)
  const [view, setView] = useState<View>('room')
  const [poster, setPoster] = useState(0)
  const [state, dispatch] = useReducer(reduce, initialState)
  const stateRef = useRef(state)
  stateRef.current = state
  const viewRef = useRef(view)
  viewRef.current = view
  // dev/e2e introspection. posterCount is exposed so the browse-wrap check in keys.mjs derives the
  // modulus instead of hardcoding it — it silently went stale the last time a poster was added.
  ;(window as unknown as { __arcade: unknown }).__arcade = { ...state, view, poster, posterCount: POSTER_COUNT }

  // font gate: never draw the CRT with a fallback font
  useEffect(() => {
    Promise.all([document.fonts.load('16px "Press Start 2P"'), document.fonts.load('20px "VT323"')]).then(() =>
      setReady(true),
    )
  }, [])

  // dispatch wrapper: sounds + control feedback + the one impure action (open profile)
  const send = useCallback((a: Action) => {
    const s = stateRef.current
    switch (a.t) {
      case 'MOVE':
        if (s.phase === 'leaderboard' || s.phase === 'detail') play('blip')
        break
      case 'COIN':
        if (s.phase === 'attract') play('coin')
        break
      case 'SELECT':
        if (s.phase === 'attract') play('coin')
        else if (s.phase === 'leaderboard') play('select')
        else if (s.phase === 'detail') {
          play('select')
          feedback.handler?.(a)
          const e = getFiltered(s.win, s.query)[s.cursor]
          if (e) window.open(profileUrl(getPlatform(), e.handle), '_blank', 'noopener')
          return
        }
        break
      case 'BACK':
        if (s.phase === 'leaderboard' || s.phase === 'detail') play('back')
        break
      case 'TOGGLE_WINDOW':
        if (s.phase === 'leaderboard' || s.phase === 'detail') play('blip')
        break
    }
    feedback.handler?.(a)
    dispatch(a)
  }, [])

  // wraps, so ← from the leftmost poster lands on the rightmost
  const browsePoster = useCallback((d: number) => {
    setPoster((p) => (p + d + POSTER_COUNT) % POSTER_COUNT)
    play('blip')
  }, [])

  // Thumb-browse the wall. Listens on window rather than the canvas so it needs no wiring through
  // FrontalScene, and fires mid-drag (not on release) so it tracks like a carousel. Tapping a
  // poster's art to walk to it still works: Framed's own `e.delta > 8` guard drops the click that
  // ends a drag. pointerType is the mobile gate — a mouse drag here would fight the room sway.
  useEffect(() => {
    if (view !== 'poster') return
    let x0 = 0
    let y0 = 0
    let fired = true
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      x0 = e.clientX
      y0 = e.clientY
      fired = false
    }
    const move = (e: PointerEvent) => {
      if (fired) return
      const dx = e.clientX - x0
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(e.clientY - y0)) return
      fired = true
      browsePoster(dx < 0 ? 1 : -1) // swipe left = next, the way a carousel moves
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
    }
  }, [view, browsePoster])

  // boot timer starts once the scene is up
  useEffect(() => {
    if (!ready) return
    const id = setTimeout(() => send({ t: 'BOOT_DONE' }), 2000)
    return () => clearTimeout(id)
  }, [ready, send])

  // autoplay needs a gesture: try on every early interaction until one sticks
  useEffect(() => {
    window.addEventListener('pointerdown', startMusic)
    window.addEventListener('keydown', startMusic)
    return () => {
      window.removeEventListener('pointerdown', startMusic)
      window.removeEventListener('keydown', startMusic)
    }
  }, [])

  const signedIn = Boolean(data.user)
  const seeMyRankUrl = data.seeMyRankUrl
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // the touch-search input owns its own keystrokes (Overlay feeds SEARCH
      // from onChange) — without this, every letter would be applied twice
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      // search mode swallows printable keys (so a/b/j/m/p/x type instead of firing);
      // arrows, Enter and Escape fall through and act on the filtered list
      const st = stateRef.current
      if (viewRef.current === 'play' && st.phase === 'leaderboard' && st.query !== null) {
        if (e.key.length === 1) {
          e.preventDefault()
          send({ t: 'SEARCH', q: st.query + e.key })
          return
        }
        if (e.key === 'Backspace') {
          e.preventDefault()
          send(st.query ? { t: 'SEARCH', q: st.query.slice(0, -1) } : { t: 'BACK' })
          return
        }
      }
      switch (e.key) {
        case '/':
          if (!e.repeat && viewRef.current === 'play' && stateRef.current.phase === 'leaderboard') {
            e.preventDefault() // Firefox quick-find
            send({ t: 'SEARCH', q: '' })
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          if (viewRef.current !== 'poster') send({ t: 'MOVE', dir: -1 })
          break
        case 'ArrowDown':
          e.preventDefault()
          if (viewRef.current !== 'poster') send({ t: 'MOVE', dir: 1 })
          break
        case 'Enter':
        case ' ':
        case 'a':
        case 'A':
          e.preventDefault() // else a focused button (SOUND / STEP BACK) fires too
          if (e.repeat || viewRef.current === 'poster') break // else it coins/selects blind
          if (viewRef.current === 'room') setView('play')
          else send({ t: stateRef.current.phase === 'attract' ? 'COIN' : 'SELECT' })
          break
        case 'p':
        case 'P': // the keyboard door to the wall — Enter is already spoken for
          if (!e.repeat && viewRef.current === 'room') setView('poster')
          break
        case 'x':
        case 'X': // open the profile on X / Threads — detail screen only
          if (e.repeat || viewRef.current !== 'play' || stateRef.current.phase !== 'detail') break
          send({ t: 'SELECT' })
          break
        case 'j':
        case 'J': // see my rank → message Stanley — no-op once you're on the board
          if (!e.repeat && !signedIn && seeMyRankUrl) window.open(seeMyRankUrl, '_blank', 'noopener')
          break
        case 'Escape':
        case 'Backspace':
        case 'b':
        case 'B':
          if (e.repeat) break
          // must precede the play branch: falling through to BACK would rewind the CRT behind you
          if (viewRef.current === 'poster') setView('room')
          else if (viewRef.current === 'play' && stateRef.current.phase === 'attract') setView('room')
          else send({ t: 'BACK' })
          break
        case 'ArrowLeft':
        case 'ArrowRight':
          e.preventDefault()
          if (e.repeat) break
          // outside poster view ←→ stays 7D/30D — it works from the room too, on the CRT
          // you can see across the floor
          if (viewRef.current === 'poster') browsePoster(e.key === 'ArrowLeft' ? -1 : 1)
          else send({ t: 'TOGGLE_WINDOW' })
          break
        case 'm':
        case 'M':
          if (!e.repeat) toggleMute()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [send, browsePoster, signedIn, seeMyRankUrl])

  if (!ready)
    return (
      <div className="arcade-root">
        <div className="splash">LOADING…</div>
      </div>
    )

  return (
    <div className="arcade-root">
      <FrontalScene
        stateRef={stateRef}
        send={send}
        view={view}
        viewRef={viewRef}
        onEnterPlay={() => setView('play')}
        poster={poster}
        onEnterPoster={(i) => {
          setPoster(i)
          setView('poster')
        }}
      />
      <Overlay
        state={state}
        send={send}
        view={view}
        onStepBack={() => setView('room')}
        onBrowsePoster={browsePoster}
      />
      {data.user ? (
        <div className="join">
          <span>@{data.user.handle}</span>
          <a href="/api/auth/logout">SIGN OUT</a>
        </div>
      ) : (
        <a className="join" href={seeMyRankUrl} target="_blank" rel="noopener noreferrer">
          SEE MY RANK
        </a>
      )}
      {auth && <AuthToast auth={auth} />}
    </div>
  )
}

function AuthToast({ auth }: { auth: ArcadeAuth }) {
  const [visible, setVisible] = useState(true)

  // clean the ?auth= param so refreshes/shares don't re-show the toast
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete('auth')
    window.history.replaceState(null, '', url)
  }, [])

  if (!visible) return null
  return (
    <button className={`toast ${auth.status}`} onClick={() => setVisible(false)}>
      {auth.status === 'ok'
        ? `YOU'RE ON THE BOARD${auth.rank ? ` — RANK #${auth.rank} OF ${auth.total}` : ''}`
        : 'SIGN IN FAILED — TRY AGAIN'}
    </button>
  )
}
