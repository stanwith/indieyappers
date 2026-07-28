import { useMemo, useRef, useState, useEffect } from 'react'
import type { ArcadeState, Action, View } from '../state'
import { getLeaderboard, getFiltered, getArcadeUser, getBoardTitle, getPlatform } from '../data/leaderboard'
import { isMuted, toggleMute } from '../sound'
import { shareSite, openPostOnX, loudestPostText } from '@/lib/share'

// `detail` names the platform the A button opens, so it is built per board.
const hints = (): Record<ArcadeState['phase'], string> => ({
  boot: '',
  attract: 'PRESS ENTER OR A TO INSERT COIN',
  leaderboard: '↑↓ SCROLL · A/ENTER SELECT · B/ESC BACK · ←→ 7D/30D · / SEARCH · M MUTE',
  detail: `↑↓ PREV/NEXT · A/ENTER OPEN ON ${getPlatform() === 'threads' ? 'THREADS' : 'X'} · B/ESC BACK · M MUTE`,
})

// stroke icons, lucide outlines — text pills read as UI clutter on a phone
const svgProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 19,
  height: 19,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

const ShareIcon = () => (
  <svg {...svgProps}>
    <path d="M12 3v13" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
)
const SoundOnIcon = () => (
  <svg {...svgProps}>
    <path d="M11 5 6 9H3v6h3l5 4z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.4 5.6a9 9 0 0 1 0 12.8" />
  </svg>
)
const SoundOffIcon = () => (
  <svg {...svgProps}>
    <path d="M11 5 6 9H3v6h3l5 4z" />
    <path d="m22 9-6 6" />
    <path d="m16 9 6 6" />
  </svg>
)
const BackIcon = () => (
  <svg {...svgProps}>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
)

function HoldButton({
  onFire,
  label,
  children,
}: {
  onFire: () => void
  label: string
  children: React.ReactNode
}) {
  const timers = useRef<{ t?: number; i?: number }>({})
  const stop = () => {
    clearTimeout(timers.current.t)
    clearInterval(timers.current.i)
  }
  useEffect(() => stop, [])
  return (
    <button
      aria-label={label}
      onPointerDown={() => {
        stop()
        onFire()
        timers.current.t = window.setTimeout(() => {
          timers.current.i = window.setInterval(onFire, 130)
        }, 350)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {children}
    </button>
  )
}

interface OverlayProps {
  state: ArcadeState
  send: (a: Action) => void
  view: View
  onStepBack: () => void
  onBrowsePoster: (d: number) => void
}

export function Overlay({ state, send, view, onStepBack, onBrowsePoster }: OverlayProps) {
  // live, not sampled once: devtools device toggles and convertible devices
  // (iPad + detached keyboard) change pointer type without a reload
  const [coarse, setCoarse] = useState(() => matchMedia('(pointer: coarse)').matches)
  useEffect(() => {
    const mq = matchMedia('(pointer: coarse)')
    const onChange = () => setCoarse(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const [muted, setMuted] = useState(isMuted())
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // only the window/query change this list; don't re-diff 100 <li>s per MOVE
  const srRows = useMemo(
    () =>
      getFiltered(state.win, state.query).map((e) => (
        <li key={e.handle}>
          {e.rank ? `${e.rank}.` : 'Unranked, not measurable:'} {e.name} (@{e.handle}) — {e.companyName}
          {e.blurb ? ` — ${e.blurb}` : ''}
        </li>
      )),
    [state.win, state.query],
  )

  // touch search: phones have no '/' key and only show a keyboard for a real
  // focused input, so an invisible input feeds the same SEARCH actions
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (state.query === null) searchRef.current?.blur()
  }, [state.query])

  // shared with the /v1 board (lib/share.ts); the arcade adds the
  // signed-in "I'm #N" brag variants on top
  const share = () =>
    shareSite(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }, getBoardTitle() || undefined)
  const postOnX = () => {
    const entries = getLeaderboard('7d')
    const user = getArcadeUser()
    const mine = user
      ? entries.find((e) => e.handle.toLowerCase() === user.handle.toLowerCase())
      : null
    // The brag variants need a signed-in user, which only the X board has, so
    // a challenge board always takes the boardTitle branch below.
    const text = mine
      ? mine.rank === 1
        ? `I'm the loudest builder on the indie timeline right now. Come take the top spot:`
        : `I'm #${mine.rank} of ${entries.length} on the indie yap leaderboard. The loudest right now is @${entries[0].handle}. See the whole board:`
      : loudestPostText(entries[0], getBoardTitle() || undefined)
    // A challenge board lives on a sub-path, so share its own URL, not the root.
    openPostOnX(text, getPlatform() === 'threads' ? globalThis.location.href : undefined)
  }

  // keep the badge in sync with the M key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') setMuted(isMuted())
    }
    window.addEventListener('keyup', onKey)
    return () => window.removeEventListener('keyup', onKey)
  }, [])

  const hint =
    view === 'poster'
      ? '←→ BROWSE · ESC BACK'
      : view === 'room'
        ? 'CLICK THE MACHINE OR PRESS ENTER TO PLAY · P FOR THE POSTERS'
        : hints()[state.phase]
  return (
    <>
      {/* touch UI is self-describing (buttons), so hints are keyboard-only */}
      {!coarse && <div className="hints">{hint}</div>}
      {view !== 'room' && (
        <button
          className="mute icon back"
          aria-label={view === 'poster' ? 'back' : 'step back'}
          onClick={onStepBack}
        >
          <BackIcon />
        </button>
      )}
      {/* .touch is space-between over its children, so one button per child div = one per
          bottom corner. Plain < > because .touch's Press Start 2P has no ‹ › glyphs. */}
      {coarse && view === 'poster' && (
        <div className="touch">
          <div>
            <button aria-label="previous poster" onClick={() => onBrowsePoster(-1)}>
              {'<'}
            </button>
          </div>
          <div>
            <button aria-label="next poster" onClick={() => onBrowsePoster(1)}>
              {'>'}
            </button>
          </div>
        </div>
      )}
      {coarse && view === 'play' && state.phase !== 'boot' && (
        <div className="touch">
          <div className="pad">
            {/* same glyphs as the poster < > buttons, rotated a quarter turn —
                ▲▼ render as emoji on some phones */}
            <HoldButton onFire={() => send({ t: 'MOVE', dir: -1 })} label="scroll up">
              <span className="chev">{'<'}</span>
            </HoldButton>
            <HoldButton onFire={() => send({ t: 'MOVE', dir: 1 })} label="scroll down">
              <span className="chev">{'>'}</span>
            </HoldButton>
          </div>
          <div>
            {state.phase === 'leaderboard' && (
              <button
                className="wide"
                aria-label="search the leaderboard"
                onClick={() => {
                  // focus must happen inside the tap handler or iOS won't open the keyboard
                  send({ t: 'SEARCH', q: state.query ?? '' })
                  searchRef.current?.focus()
                }}
              >
                FIND
              </button>
            )}
            {/* A left, B right — matches the physical cabinet's button order (SELECT at x=0.12,
                BACK at x=0.27 in FrontalScene), not the Nintendo one */}
            <button
              aria-label="select"
              onClick={() => send({ t: state.phase === 'attract' ? 'COIN' : 'SELECT' })}
            >
              A
            </button>
            <button aria-label="back" onClick={() => send({ t: 'BACK' })}>
              B
            </button>
          </div>
        </div>
      )}
      {coarse && view === 'play' && state.phase === 'leaderboard' && (
        <input
          ref={searchRef}
          className="search-input"
          value={state.query ?? ''}
          onChange={(e) => send({ t: 'SEARCH', q: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              searchRef.current?.blur()
              send({ t: 'SELECT' })
            }
          }}
          enterKeyHint="go"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="filter the leaderboard"
        />
      )}
      <div className="top-actions">
        {!coarse && (
          <>
            <button className="mute" onClick={postOnX}>
              POST ON X
            </button>
            <button className="mute" onClick={share}>
              {copied ? 'COPIED!' : 'SHARE'}
            </button>
          </>
        )}
        <button
          className="mute icon"
          aria-label={muted ? 'sound off' : 'sound on'}
          aria-pressed={!muted}
          onClick={() => setMuted(toggleMute())}
        >
          {muted ? <SoundOffIcon /> : <SoundOnIcon />}
        </button>
        {coarse && (
          <div className="share-wrap">
            <button
              className="mute icon"
              aria-label="share"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <ShareIcon />
            </button>
            {menuOpen && (
              <>
                <button
                  className="menu-backdrop"
                  aria-label="close share menu"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="share-menu">
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      share()
                    }}
                  >
                    SHARE
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      postOnX()
                    }}
                  >
                    POST ON X
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <ol className="sr-only" aria-label="Top 100 Indies leaderboard">
        {srRows}
      </ol>
    </>
  )
}
