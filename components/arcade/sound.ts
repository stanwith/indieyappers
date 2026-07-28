// WebAudio-synthesized chiptune SFX — no audio files.
let ctx: AudioContext | null = null
let muted = localStorage.getItem('ih100-muted') === '1'

export const isMuted = () => muted

export function toggleMute(): boolean {
  muted = !muted
  localStorage.setItem('ih100-muted', muted ? '1' : '0')
  if (muted) {
    playing = false
    ramp(FADE)
    setTimeout(() => !playing && el?.pause(), FADE * 1000)
  } else if (el) {
    playing = true
    void el.play()
    ramp(FADE)
  } else {
    startMusic()
  }
  return muted
}

function ac(): AudioContext {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface ToneOpts {
  type?: OscillatorType
  delay?: number
  vol?: number
  slide?: number
}

function tone(freq: number, dur: number, opts: ToneOpts = {}) {
  const a = ac()
  const t0 = a.currentTime + (opts.delay ?? 0)
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = opts.type ?? 'square'
  osc.frequency.setValueAtTime(freq, t0)
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur)
  gain.gain.setValueAtTime(opts.vol ?? 0.06, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

// Background music: one looping element through a gain node — fades in at the
// start, out on mute, and across the loop seam. Gain, not el.volume: iOS
// Safari ignores HTMLAudioElement.volume.
const MUSIC_VOL = 0.25
const FADE = 3 // seconds
let el: HTMLAudioElement | null = null
let gain: GainNode | null = null
let playing = false

// volume envelope for the current playhead: 0 at both edges of the track
function target(): number {
  if (!playing || !el?.duration) return 0
  return MUSIC_VOL * Math.min(1, el.currentTime / FADE, (el.duration - el.currentTime) / FADE)
}

function ramp(seconds: number) {
  if (!gain) return
  const t = ac().currentTime
  gain.gain.cancelScheduledValues(t)
  gain.gain.setValueAtTime(gain.gain.value, t)
  gain.gain.linearRampToValueAtTime(target(), t + seconds)
}

/** Safe to call on every user gesture — no-ops once running, retries if autoplay was blocked. */
export function startMusic() {
  if (el || muted) return
  try {
    const a = ac()
    el = new Audio('/music.mp3')
    el.loop = true
    gain = a.createGain()
    gain.gain.value = 0
    a.createMediaElementSource(el).connect(gain).connect(a.destination)
    el.ontimeupdate = () => playing && ramp(0.4) // fires ~4Hz: tracks the seam envelope
    playing = true
    el.play()
      .then(() => ramp(FADE))
      .catch(() => {
        el = gain = null // autoplay blocked; next gesture tries again
        playing = false
      })
  } catch {
    el = gain = null
    playing = false
  }
}

export type Sfx = 'blip' | 'select' | 'back' | 'coin'

export function play(name: Sfx) {
  if (muted) return
  try {
    switch (name) {
      case 'blip':
        tone(880, 0.05)
        break
      case 'select':
        tone(523, 0.07)
        tone(784, 0.12, { delay: 0.07 })
        break
      case 'back':
        tone(400, 0.1, { slide: 220 })
        break
      case 'coin':
        tone(988, 0.09)
        tone(1319, 0.35, { delay: 0.09 })
        break
    }
  } catch {
    // audio is flavor, never fatal
  }
}
