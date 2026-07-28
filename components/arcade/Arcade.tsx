'use client'

import dynamic from 'next/dynamic'
import type { ArcadeProps } from './ArcadeApp'
import './arcade.css'

// The whole arcade subtree touches document/window at module scope
// (canvas + WebGL + WebAudio), so it must never be evaluated on the server.
const ArcadeApp = dynamic(() => import('./ArcadeApp'), {
  ssr: false,
  loading: () => (
    <div className="arcade-root">
      <div className="splash">LOADING…</div>
    </div>
  ),
})

export function Arcade(props: ArcadeProps) {
  return <ArcadeApp {...props} />
}
