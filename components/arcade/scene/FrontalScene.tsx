// The money shot: a fixed, dead-on frontal view of the cabinet — glowing recessed CRT,
// screen light spilling onto the shadowbox interior, controls silhouetted below,
// one glowing coin button. Composition + lighting over geometry (everything is boxes).
import { Fragment, useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, RoundedBox, useGLTF, useTexture } from '@react-three/drei'
import { EffectComposer, Bloom, Noise, Vignette, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { MutableRefObject } from 'react'
import { feedback, type ArcadeState, type Action, type View } from '../state'
import { getPlatform } from '../data/leaderboard'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { useCRT, emission } from './crt'

RectAreaLightUniformsLib.init() // required once for RectAreaLight

const HIT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true })

// Baked once at module init. White = base roughness (look unchanged); dark streaks
// multiply roughness DOWN so scratches read as buffed wear catching the IBL.
function makeScratchTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, 512, 512)
  const r = (a: number, b: number) => a + Math.random() * (b - a)
  for (let i = 0; i < 60; i++) {
    const x = r(0, 512), y = r(0, 512), a = r(0, Math.PI * 2), len = r(20, 180)
    g.strokeStyle = `rgba(0,0,0,${r(0.05, 0.3)})`
    g.lineWidth = r(0.5, 1.6)
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo( // slight bow so strokes read as scratches, not hairs
      x + Math.cos(a) * len * 0.5 + r(-8, 8), y + Math.sin(a) * len * 0.5 + r(-8, 8),
      x + Math.cos(a) * len, y + Math.sin(a) * len)
    g.stroke()
  }
  for (let i = 0; i < 400; i++) { // micro-pitting / speckle
    g.fillStyle = `rgba(0,0,0,${r(0.03, 0.1)})`
    g.fillRect(r(0, 512), r(0, 512), 1, 1)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping // extrude UVs go negative; RoundedBox tiles 1:1
  return t
}
const SCRATCH = makeScratchTexture()

const MAT = {
  // white machine: cream body, ink deck + marquee band for contrast.
  // The chassis is metal (diffuse = color * (1 - metalness), and ambient never reaches the
  // specular lobe), so envMapIntensity — not any light — is its brightness knob.
  body: new THREE.MeshStandardMaterial({ color: '#b9bdc4', roughness: 0.42, metalness: 0.75, envMapIntensity: 2.2, roughnessMap: SCRATCH, bumpMap: SCRATCH, bumpScale: 0.002 }),
  cheek: new THREE.MeshPhysicalMaterial({ color: '#b9bdc4', roughness: 0.32, metalness: 0.8, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 2.2, roughnessMap: SCRATCH, bumpMap: SCRATCH, bumpScale: 0.002 }),
  // IBL has no occlusion, so without this opt-out the shadowbox recess gets lit exactly as
  // hard as the cabinet's exterior and greys out the frame the tube reads against.
  ink: new THREE.MeshStandardMaterial({ color: '#101014', roughness: 0.6, metalness: 0.2, envMapIntensity: 0.28 }),
  interior: new THREE.MeshStandardMaterial({ color: '#141418', roughness: 0.9, metalness: 0, envMapIntensity: 0.15 }),
  wall: new THREE.MeshStandardMaterial({ color: '#171226', roughness: 0.92, metalness: 0, envMapIntensity: 0.35 }), // dark purple CRT wall
  // lifted off pure ink so the lower body reads as a dark panel and not a hole in the room view
  deck: new THREE.MeshStandardMaterial({ color: '#191920', roughness: 0.5, metalness: 0.25, roughnessMap: SCRATCH }),
  chrome: new THREE.MeshStandardMaterial({ color: '#c8ccd2', metalness: 1, roughness: 0.3, envMapIntensity: 1.6 }),
  purple: new THREE.MeshPhysicalMaterial({ color: '#6c63ff', roughness: 0.28, clearcoat: 0.6 }),
  cream: new THREE.MeshPhysicalMaterial({ color: '#efe9dc', roughness: 0.35, clearcoat: 0.4 }),
  steel: new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 1, roughness: 0.4 }),
}

// The game room shell: one inside-out box, but BoxGeometry's 6 groups let the floor and ceiling
// be darker than the walls off a single mesh. Group order is [+x, -x, +y, -y, +z, -z].
const CEILING_Y = 2.4 // 0.53 above the cabinet: low enough that the ceiling is actually in frame
const ROOM = (() => {
  const face = (color: string, env = 0.5) =>
    new THREE.MeshStandardMaterial({ side: THREE.BackSide, color, roughness: 1, metalness: 0, envMapIntensity: env })
  const wall = face('#14131a')
  // The floor is viewed at a ~80 degree grazing angle, where dielectric Fresnel reflectance
  // climbs toward 1 — so it mirrors the neon ceiling AND the 46-intensity screen light no matter
  // how black the albedo is. Colour does nothing and envMapIntensity only cuts the IBL half;
  // specularIntensity 0 deletes the specular lobe outright, leaving the near-zero diffuse.
  const floor = new THREE.MeshPhysicalMaterial({
    side: THREE.BackSide,
    color: '#0d0d13',
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.2, // pure matte diffuse now, so this reads as a dark floor, not a mirror
    specularIntensity: 0,
  })
  return [wall, wall, face('#0d0c12'), floor, wall, wall]
})()

// Visible neon fixtures. >1 colour so they cross Bloom's luminanceThreshold and glow; NOT
// toneMapped:false, so the ACES pass rolls them off instead of clipping to white blobs.
// pink / white / teal. The white runs sit at x ±1.6, matching the Environment's fluorescent
// tubes, so the lengthwise specular streak on the top cap lines up with a fixture you can
// actually see.
const TUBE_MATS = (['#ff5ec8', '#eaf0ff', '#4ad9ff'] as const).map((hex, i) =>
  new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar([2.6, 2.4, 2.2][i]) }),
)
const ROOM_W = 7
const ROOM_HALF = ROOM_W / 2

// Every stripe is a DOUBLE: a main colour plus a companion colour touching it, same shape.
// Indices into TUBE_MATS: pink+white (inner), white+teal (middle), teal+white (outer).
const PAIRS = [
  [0, 1],
  [1, 2],
  [2, 1],
] as const

// Six double neon runs, three per side, mirror-symmetric. Each is ONE polyline of straight
// segments: front-to-back along the ceiling (reads as a vertical line from the frontal camera),
// a rounded 90° bend toward its side wall, then a straight diagonal stroke down that wall to
// the floor. Bend depths stagger by 1.5 so the wall diagonals land parallel and evenly spaced.
// Points sit ~6cm proud of the surfaces (neon tube on standoffs).
const NEON_RUNS = ([-1, 1] as const).flatMap((s) =>
  [0, 1, 2].map((j) => {
    const x = s * (0.55 + j * 1.05)
    const zBend = -3.9 + j * 1.5
    return {
      s,
      mats: PAIRS[j].map((mi) => TUBE_MATS[mi]),
      pts: [
        [x, CEILING_Y - 0.06, 3.5],
        [x, CEILING_Y - 0.06, zBend],
        [s * (ROOM_HALF - 0.06), CEILING_Y - 0.06, zBend],
        // diagonal leans toward the front and runs PAST the floor — same slope, y<0 — so the floor
        // plane's depth clips the tube instead of it stopping short with a visible end cap
        [s * (ROOM_HALF - 0.06), -0.35, zBend + 1.222],
      ] as [number, number, number][],
    }
  }),
)

// Straight legs trimmed by r at each interior vertex, joined by a quadratic bezier through the
// vertex — rounded corners, and the runs between them are exactly straight.
function roundedPath(pts: THREE.Vector3[], r: number) {
  const path = new THREE.CurvePath<THREE.Vector3>()
  let prev = pts[0]
  for (let i = 1; i < pts.length - 1; i++) {
    const c = pts[i]
    const a = c.clone().sub(c.clone().sub(prev).normalize().multiplyScalar(r))
    const b = c.clone().add(pts[i + 1].clone().sub(c).normalize().multiplyScalar(r))
    path.add(new THREE.LineCurve3(prev, a))
    path.add(new THREE.QuadraticBezierCurve3(a, c, b))
    prev = b
  }
  path.add(new THREE.LineCurve3(prev, pts[pts.length - 1]))
  return path
}

// The companion is a TRUE parallel of the base path: the same point at every arc position,
// pushed a constant distance sideways along the surface the tube runs on (across the ceiling,
// then rotating onto the wall over the first 0.4m of descent). Offsetting the finished curve —
// rather than re-drawing a shifted polyline — is what keeps the pair gap-free through corners.
function offsetCurve(base: THREE.CurvePath<THREE.Vector3>, s: number, off: number) {
  return new (class extends THREE.Curve<THREE.Vector3> {
    constructor() {
      super() // an implicit constructor would inherit Curve's `protected` and refuse `new`
    }
    getPoint(t: number, target = new THREE.Vector3()) {
      const p = base.getPointAt(t)
      const a = Math.min(1, Math.max(0, (CEILING_Y - 0.06 - p.y) / 0.4)) // 0 = on ceiling, 1 = on wall
      const dir = new THREE.Vector3(-s * a, -(1 - a), 0) // surface normal, blended at the wall corner
        .cross(base.getTangentAt(t))
        .multiplyScalar(s)
        .normalize()
      return target.copy(p).addScaledVector(dir, off)
    }
  })()
}

function NeonRun({ pts, mats, s }: { pts: [number, number, number][]; mats: readonly THREE.Material[]; s: number }) {
  const tubes = useMemo(() => {
    const base = roundedPath(pts.map((p) => new THREE.Vector3(...p)), 0.28)
    // no end cap: the tube's open end is buried under the floor
    return [base, offsetCurve(base, s, 0.062)].map((c) => new THREE.TubeGeometry(c, 256, 0.03, 12, false))
  }, [pts, s])
  return (
    <group>
      {tubes.map((geo, i) => (
        <mesh key={i} geometry={geo} material={mats[i]} raycast={() => null} />
      ))}
    </group>
  )
}

interface Pose {
  pos: THREE.Vector3
  look: THREE.Vector3
  fov: number
  sway: number
}

// room = the machine standing in the dark; play = leaning in, screen dominant, controls below
const POSES = {
  room: (p: boolean): Pose => ({
    pos: new THREE.Vector3(0, 1.12, p ? 2.7 : 2.2),
    look: new THREE.Vector3(0, 1.14, 0),
    fov: p ? 54 : 44,
    sway: 0.05,
  }),
  play: (): Pose => ({
    // vertical-fit baseline only — fitScreen() below owns the horizontal fit, which is why this
    // one no longer branches on `portrait`
    pos: new THREE.Vector3(0, 1.5, 0.98),
    look: new THREE.Vector3(0, 1.14, -0.26),
    fov: 44,
    sway: 0.012,
  }),
}

// The CRT quad (0.86 × 0.645) reclined -0.15 rad at [0, 1.27, -0.09] — see the tube below.
// Only the top corners matter: the recline tips that edge toward the camera, so it is always
// the first thing to leave frame.
const SCREEN_HALF_W = 0.43
const SCREEN_TOP_Y = 1.27 + 0.3225 * Math.cos(0.15)
const SCREEN_TOP_Z = -0.09 - 0.3225 * Math.sin(0.15)
const SCREEN_BOT_Y = 1.27 - 0.3225 * Math.cos(0.15)
const SCREEN_BOT_Z = -0.09 + 0.3225 * Math.sin(0.15)
const SCREEN_CORNERS = [
  new THREE.Vector3(-SCREEN_HALF_W, SCREEN_TOP_Y, SCREEN_TOP_Z),
  new THREE.Vector3(SCREEN_HALF_W, SCREEN_TOP_Y, SCREEN_TOP_Z),
  new THREE.Vector3(-SCREEN_HALF_W, SCREEN_BOT_Y, SCREEN_BOT_Z),
  new THREE.Vector3(SCREEN_HALF_W, SCREEN_BOT_Y, SCREEN_BOT_Z),
]

// fov is VERTICAL, so horizontal extent is fov × aspect and a pose tuned for vertical fit says
// nothing about whether the screen's width fits — on a phone (aspect 0.46) the old play pose put
// ~20% of the leaderboard off each edge, RANK and YAP SCORE columns included. Back off along the
// view axis until the screen's own edges sit exactly on the frame edge: flush, no margin, because
// play view IS the leaderboard, so width goes to legibility rather than bezel. Pulling back along
// the view direction leaves the direction (and the composition) untouched, and depth grows
// linearly, so ndcX scales as 1/depth. Same contain-not-crop rule as posterPose.
function fitScreen(pose: Pose, aspect: number, portrait: boolean): Pose {
  const back = pose.pos.clone().sub(pose.look).normalize()
  // distance to the top corner along the view axis; no roll or yaw, so x needs no transform
  const depth = -(SCREEN_TOP_Z - pose.pos.z) * back.z - (SCREEN_TOP_Y - pose.pos.y) * back.y
  const halfW = Math.tan((pose.fov * Math.PI) / 360) * depth * aspect
  // Fit the whole SWAY ENVELOPE, not just the screen: the rig wanders the camera sideways by
  // pose.sway every frame, so a truly flush fit clips by exactly that much on the leading edge.
  // Mirrors the rig's own rule (`sx = portrait ? 0 : ...`) — zero reserve where there is no sway,
  // so phones stay flush, which is the whole point.
  const over = (SCREEN_HALF_W + (portrait ? 0 : pose.sway)) / halfW
  if (over > 1) pose.pos.addScaledVector(back, depth * (over - 1))
  return pose
}

// Portrait can't frame the cabinet and the side walls at once — at aspect 0.46 the room pose
// sees only x ±1.66 of the back wall while the nearest poster edge is at -1.82, and no fov or
// pull-back fixes it (framing ±3.2 would put the camera at z≈9, outside the room). So on those
// viewports a drag walks the room view sideways. Module-level for the same reason as state.ts's
// `feedback`: the rig reads it every frame, and nothing should re-render at 60fps.
const pan = { x: 0 }
const PAN_LIMIT = 2.1 // camera stays well inside the room (half-width 3.5)

function useRoomPan(el: HTMLElement, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let id = -1
    let x0 = 0
    let base = 0
    const down = (e: PointerEvent) => {
      id = e.pointerId
      x0 = e.clientX
      base = pan.x
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      // 0.0085 world/px ≈ 1:1 with the back wall at the portrait room pose, so it tracks the thumb
      pan.x = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, base - (e.clientX - x0) * 0.0085))
    }
    const up = () => (id = -1)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [el, enabled])
}

function CameraRig({ view, poster }: { view: View; poster: number }) {
  const { camera, pointer, size, gl } = useThree()
  const aspect = size.width / size.height
  const portrait = aspect < 0.8
  // unlike room, poster and play depend on the real aspect — so `size`, not just `portrait`,
  // or rotating a phone leaves them mis-framed until the next input
  const pose = useMemo(
    () =>
      view === 'poster'
        ? posterPose(poster, portrait, aspect)
        : view === 'play'
          ? fitScreen(POSES.play(), aspect, portrait)
          : POSES.room(portrait),
    [view, poster, portrait, size],
  )
  // room only: the listeners used to stay live in poster view, so a poster swipe would bank into
  // pan.x and you'd walk back into a room already shoved off to one side
  useRoomPan(gl.domElement, portrait && view === 'room')
  const target = useMemo(() => new THREE.Vector3(), [])
  const lookTo = useMemo(() => new THREE.Vector3(), [])
  const look = useRef(new THREE.Vector3(0, 1.14, 0))
  // rate the travel, not the destination: the walk to a poster is ~4m, and picking the rate from
  // `view` alone would whip you back over that same 4m on the way out. Advances only on arrival.
  const from = useRef(view)
  // dev/e2e introspection, same spirit as window.__arcade — but that one is React state and so
  // can't see the post-lerp camera, which is the only thing that says whether the screen is
  // actually on frame. Worst-case |ndc| over the CRT's own corners; > 1 means clipped. `settled`
  // because mid-flight readings are meaningless (a resize walks the camera backward, so it is
  // transiently clipped by definition) and headless runs a few fps, where sampling twice can
  // straddle zero new frames and look stable while still travelling.
  const settled = useRef(false)
  useEffect(() => {
    const w = window as unknown as { __screenNdc: () => { x: number; y: number; settled: boolean } }
    w.__screenNdc = () => {
      const p = SCREEN_CORNERS.map((c) => c.clone().project(camera))
      return {
        x: Math.max(...p.map((v) => Math.abs(v.x))),
        y: Math.max(...p.map((v) => Math.abs(v.y))),
        settled: settled.current,
      }
    }
  }, [camera])
  useFrame((_, dt) => {
    const long = view === 'poster' || from.current === 'poster'
    const k = 1 - Math.exp(-(long ? 2.8 : view === 'play' ? 4.5 : 6.5) * Math.min(dt, 0.1))
    const px = view === 'room' ? pan.x : 0
    // touch never fires pointermove at rest, so on the viewports that can pan, every drag would
    // otherwise bake its last position in as a permanent sway offset
    const sx = portrait ? 0 : pointer.x * pose.sway
    const sy = portrait ? 0 : pointer.y * pose.sway * 0.7
    target.set(pose.pos.x + px + sx, pose.pos.y + sy, pose.pos.z)
    camera.position.lerp(target, k)
    lookTo.copy(pose.look)
    lookTo.x += px
    look.current.lerp(lookTo, 1 - Math.exp(-5 * Math.min(dt, 0.1)))
    camera.lookAt(look.current)
    const cam = camera as THREE.PerspectiveCamera
    if (Math.abs(cam.fov - pose.fov) > 0.05) {
      cam.fov += (pose.fov - cam.fov) * k
      cam.updateProjectionMatrix()
    }
    const d = camera.position.distanceTo(target)
    settled.current = d < 0.002 && Math.abs(cam.fov - pose.fov) <= 0.05
    if (d < 0.03) from.current = view
  })
  return null
}

// rounded quad through 4 corner points (allows the reference's bottom-flared opening)
function roundedQuad(corners: [number, number][], r: number): THREE.Path {
  const p = new THREE.Path()
  const v = corners.map(([x, y]) => new THREE.Vector2(x, y))
  for (let i = 0; i < 4; i++) {
    const c = v[i]
    const prev = v[(i + 3) % 4]
    const next = v[(i + 1) % 4]
    const inD = c.clone().sub(prev).normalize()
    const outD = next.clone().sub(c).normalize()
    const entry = c.clone().sub(inD.clone().multiplyScalar(r))
    const exit = c.clone().add(outD.clone().multiplyScalar(r))
    if (i === 0) p.moveTo(entry.x, entry.y)
    else p.lineTo(entry.x, entry.y)
    p.quadraticCurveTo(c.x, c.y, exit.x, exit.y)
  }
  p.closePath()
  return p
}

const trap = (wTop: number, wBot: number, h: number): [number, number][] => [
  [-wBot / 2, -h / 2],
  [wBot / 2, -h / 2],
  [wTop / 2, h / 2],
  [-wTop / 2, h / 2],
]

// the monitor surround: ONE extruded plate with a flared rounded hole — the hole's walls
// are the recess interior, the bevel is the soft inner lip (no seams, no strips)
function useBezelGeometry() {
  return useMemo(() => {
    const shape = new THREE.Shape(roundedQuad(trap(0.98, 0.98, 0.78), 0.025).getPoints(24))
    shape.holes.push(roundedQuad(trap(0.88, 0.88, 0.66), 0.052))
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 6,
      curveSegments: 24,
    })
    geo.translate(0, 0, -0.12)
    return geo
  }, [])
}


// the lower half as ONE wedge: its top face lies exactly in the control group's plane
// (origin (0,0.925,0.19), rot -0.1, local y +0.035), so the controls sit on it seamlessly
function useLowerBodyGeometry() {
  return useMemo(() => {
    const pts: [number, number][] = [
      [-0.29, 0.0],
      [-0.29, 0.94], // back top (hidden behind the bezel bottom)
      [-0.0125, 0.94], // deck surface back
      [0.3855, 0.98], // deck nose (matches the tilted control plane)
      [0.3855, 0.9], // nose face
      [0.375, 0.88],
      [0.375, 0.12], // front face
      [0.335, 0.12], // kick inset
      [0.335, 0.0],
    ]
    const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)))
    shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.98,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.006,
      bevelSegments: 2,
      curveSegments: 8,
    })
    geo.rotateY(-Math.PI / 2)
    geo.translate(0.49 + 0.008, 0, 0)
    return geo
  }, [])
}

function Joystick({ send }: { send: (a: Action) => void }) {
  const pivot = useRef<THREE.Group>(null!)
  const tilt = useRef(0)
  const hold = useRef<{ t?: number; i?: number }>({})
  const stop = () => {
    clearTimeout(hold.current.t)
    clearInterval(hold.current.i)
  }
  const start = (dir: 1 | -1) => () => {
    stop()
    const fire = () => send({ t: 'MOVE', dir })
    fire()
    hold.current.t = window.setTimeout(() => {
      hold.current.i = window.setInterval(fire, 130)
    }, 350)
  }
  useEffect(() => stop, [])

  // keyboard/touch feedback also tilts the stick
  useEffect(() => {
    const prev = feedback.handler
    feedback.handler = (a: Action) => {
      prev?.(a)
      if (a.t === 'MOVE') tilt.current = a.dir > 0 ? 0.45 : -0.45
    }
    return () => {
      feedback.handler = prev
    }
  }, [])

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05)
    tilt.current *= Math.exp(-4 * d)
    pivot.current.rotation.x += (tilt.current - pivot.current.rotation.x) * Math.min(1, d * 30)
  })

  return (
    <group position={[-0.22, 0.05, -0.07]}>
      <mesh material={MAT.ink}>
        <cylinderGeometry args={[0.045, 0.05, 0.012, 24]} />
      </mesh>
      <group ref={pivot}>
        <mesh position={[0, 0.038, 0]} material={MAT.steel}>
          <cylinderGeometry args={[0.007, 0.0095, 0.075, 12]} />
        </mesh>
        {/* rubber dust washer at the shaft base */}
        <mesh position={[0, 0.014, 0]} material={MAT.ink}>
          <cylinderGeometry args={[0.009, 0.02, 0.018, 16]} />
        </mesh>
        <mesh position={[0, 0.082, 0]} material={MAT.purple}>
          <sphereGeometry args={[0.032, 24, 24]} />
        </mesh>
      </group>
      {/* height-split zones for the frontal camera: above the ball = up, below = down */}
      <mesh
        position={[0, 0.175, 0.01]}
        material={HIT}
        onPointerDown={(e) => {
          e.stopPropagation()
          start(-1)()
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
      >
        <boxGeometry args={[0.17, 0.13, 0.16]} />
      </mesh>
      <mesh
        position={[0, 0.04, 0.01]}
        material={HIT}
        onPointerDown={(e) => {
          e.stopPropagation()
          start(1)()
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
      >
        <boxGeometry args={[0.17, 0.13, 0.16]} />
      </mesh>
    </group>
  )
}

function PushButton({
  x,
  color,
  action,
  send,
  acts,
}: {
  x: number
  color: THREE.Material
  action: Action
  send: (a: Action) => void
  acts: Action['t'][]
}) {
  const cap = useRef<THREE.Mesh>(null!)
  const press = useRef(0)
  useEffect(() => {
    const prev = feedback.handler
    feedback.handler = (a: Action) => {
      prev?.(a)
      if (acts.includes(a.t)) press.current = 1
    }
    return () => {
      feedback.handler = prev
    }
  }, [acts])
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05)
    press.current *= Math.exp(-6 * d)
    cap.current.position.y = 0.024 - press.current * 0.012
  })
  return (
    <group position={[x, 0.05, -0.05]}>
      <mesh material={MAT.ink}>
        <cylinderGeometry args={[0.037, 0.04, 0.01, 24]} />
      </mesh>
      <mesh ref={cap} position={[0, 0.024, 0]} material={color}>
        <cylinderGeometry args={[0.033, 0.037, 0.032, 24]} />
      </mesh>
      <mesh position={[0, 0.03, 0]} material={HIT} onPointerDown={() => send(action)}>
        <cylinderGeometry args={[0.05, 0.05, 0.07, 12]} />
      </mesh>
    </group>
  )
}

// Spill colour of the marquee backlight onto the cabinet. Violet to match the blue/pink
// neon in the art — the tuning knob if the artwork's palette changes.
const MARQUEE_GLOW = '#9d8cff'

// Backlit marquee art (title + mascots are baked in, one file per board). Sized by width so it
// spans the sign edge-to-edge, with the aspect read off the source pixels — the two boards' art
// is not the same shape. New art must stay wider than ~5.7:1 or its height exceeds the 0.15
// black panel behind the sign.
function MarqueeArt({ src, width, position }: { src: string; width: number; position: [number, number, number] }) {
  const tex = useTexture(src)
  useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
  }, [tex])
  // three types .image as unknown; from TextureLoader it is the <img>, with the source pixel size
  const img = tex.image as HTMLImageElement
  return (
    <mesh position={position} raycast={() => null}>
      <planeGeometry args={[width, (width * img.height) / img.width]} />
      <meshStandardMaterial
        map={tex}
        emissiveMap={tex}
        emissive="#ffffff"
        emissiveIntensity={0.85}
        transparent
        alphaTest={0.15}
        roughness={0.7}
      />
    </mesh>
  )
}

// A vinyl sticker slapped on the bare left corner of the control deck. Its own component so it
// suspends on its own instead of holding back the whole cabinet.
// ponytail: one lit plane a hair above the deck — no decal projection, no second UV set. The
// deck is flat there, so nothing to conform to; revisit only if it moves onto a curved face.
function PanelSticker() {
  const tex = useTexture('/sticker.webp')
  useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
  }, [tex])
  return (
    <mesh position={[-0.365, 0.0425, 0.005]} rotation={[-Math.PI / 2, 0, 0.34]} raycast={() => null}>
      <planeGeometry args={[0.11, 0.11 / (640 / 650)]} />
      <meshStandardMaterial map={tex} transparent alphaTest={0.4} roughness={0.42} metalness={0} envMapIntensity={0.45} />
    </mesh>
  )
}

// Back-wall decor. The side walls are near edge-on slivers from the room pose (they only enter
// frame past z=-3.2), so all of this goes on the back wall where there's actually screen area.
const WALL_Z = -4.36 // back wall interior is -4.4
const HANG_TOP = 1.675 // shared top edge, the way a real gallery wall lines up

// The wall, as data — the camera needs to know where the art is, not just the renderer.
// Sizes are the source art's own aspect ratio (2:3 portrait, 1.41:1 landscape); the y offsets
// are the composed values, which are deliberately NOT a single formula.
// Order is left-to-right, which is also the order ←/→ browses in.
interface PosterDef {
  src: string
  size: [number, number]
  position: [number, number, number]
  // Painted steel, not paper: no frame, no backing, and the art's own alpha is the silhouette.
  bare?: boolean
}
const POSTERS: PosterDef[] = [
  // left frame edge lands at -3.23, mirroring the test card's 0.27 margin to its own corner
  { src: '/poster-stanley-ranking.webp', size: [0.54, 0.828], position: [-2.93, HANG_TOP - 0.414, WALL_Z] },
  { src: '/poster-indie-hacking.webp', size: [0.54, 0.81], position: [-2.09, HANG_TOP - 0.405, WALL_Z] },
  // Centred. NOTE: the cabinet hides |x| < 2.4 of this wall from the room pose — the ray from the
  // camera past the front cheek (x=0.67, z=0.39) reaches the wall at x=2.43 — so whatever sits here
  // is fully occluded from the door and exists to be browsed to, not seen. 768/512 = 1.5.
  { src: '/sign-stanley.webp', size: [1.2, 0.8], position: [0, HANG_TOP - 0.4, WALL_Z], bare: true },
  // Back at its original 1.2x0.849: at 1.5 the frame edge reached 3.38, leaving 0.12 to the corner
  // where this keeps 0.27 — the margin the ninja poster mirrors on the far side.
  { src: '/poster-test-card.webp', size: [1.2, 0.849], position: [2.6, HANG_TOP - 0.455, WALL_Z] },
]
export const POSTER_COUNT = POSTERS.length

// Framing margin, per axis, because the two axes are doing different jobs. Height-bound is the
// normal case and 1.5 is what keeps the poster's own WallLight (y 1.82) inside the top of frame —
// the fixture is the whole reason the shot is lit, so cropping it looks like a mistake. Width-bound
// only happens to a landscape poster on a portrait phone, where every extra bit of margin is
// letterboxing you can't fill (the wall is black), so it's as tight as the frame edge allows.
const FIT_H = 1.5
const FIT_W = 1.1

// Stand square to the poster, far enough back to CONTAIN the frame in either orientation.
// max() not min(): min would fill the viewport by cropping the art, which is the one thing
// a poster view must not do.
function posterPose(i: number, portrait: boolean, aspect: number): Pose {
  const [w, h] = POSTERS[i].size
  const [x, y, z] = POSTERS[i].position
  const fov = portrait ? 46 : 40
  const t = Math.tan((fov * Math.PI) / 360)
  const dz = Math.max((FIT_H * h) / 2 / t, (FIT_W * w) / 2 / (t * aspect))
  return { pos: new THREE.Vector3(x, y, z + dz), look: new THREE.Vector3(x, y, z), fov, sway: 0.02 }
}

// Framed art: steel frame, paper backing (the mascot png is transparent), art on top.
// `bare` drops both and leaves the art plane alone — a road sign bolted to the wall. It shares this
// component rather than getting its own because the frame is the cheap half: the click-to-approach
// group below (drag guard, play-view gate, cursor) is the part worth not duplicating.
function Framed({
  src,
  size,
  position,
  bare,
  viewRef,
  onEnter,
}: PosterDef & { viewRef: MutableRefObject<View>; onEnter: () => void }) {
  const tex = useTexture(src)
  useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace
    // The sign is the one piece that gets read at a hard angle from the room pose, and it carries
    // fine weathering speckle, so it wants more taps than framed art seen square-on.
    tex.anisotropy = bare ? 8 : 4
  }, [tex, bare])
  const [w, h] = size
  // `!== 'play'` not `=== 'room'`: the play pose still sees the whole back wall behind the
  // cabinet, where a poster click would be an accident — but from one poster you can click
  // straight to another.
  const live = () => viewRef.current !== 'play'
  return (
    <group
      position={position}
      onClick={(e) => {
        // R3F dispatches onClick after any drag (its own delta<=2 threshold guards
        // onPointerMissed only), so without this a portrait pan ending on art opens it
        if (e.delta > 8 || !live()) return
        e.stopPropagation()
        onEnter()
      }}
      onPointerOver={() => {
        if (live()) document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        if (live()) document.body.style.cursor = 'auto'
      }}
    >
      {!bare && (
        <>
          <RoundedBox args={[w + 0.06, h + 0.06, 0.025]} radius={0.006} smoothness={2} material={MAT.steel} />
          <mesh position={[0, 0, 0.014]}>
            <planeGeometry args={[w, h]} />
            <meshStandardMaterial color="#d9d4c8" roughness={0.85} />
          </mesh>
        </>
      )}
      <mesh position={[0, 0, 0.016]}>
        <planeGeometry args={[w, h]} />
        {/* Paper over a backing can just blend; a cutout with nothing behind it needs alphaTest, or
            the discarded pixels still write depth and punch a hole in the wall. Paint over
            aluminium is mostly dielectric, so metalness stays low and roughness does the work. */}
        <meshStandardMaterial
          map={tex}
          transparent
          alphaTest={bare ? 0.5 : 0}
          roughness={bare ? 0.52 : 0.85}
          metalness={bare ? 0.15 : 0}
        />
      </mesh>
    </group>
  )
}

const FIXTURE_GLOW = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffdcab').multiplyScalar(1.8) })

// Gallery picture light: the fixture you see, plus one pointLight for the pool it throws. A
// pointLight (not another rectAreaLight) because those are expensive and there are 4 already.
// Warm tungsten, so the decor reads as a separate light source from the cool neon.
function WallLight({ x }: { x: number }) {
  return (
    <group position={[x, 1.82, WALL_Z]}>
      <mesh position={[0, 0, 0.06]} material={MAT.steel}>
        <boxGeometry args={[0.34, 0.04, 0.1]} />
      </mesh>
      <mesh position={[0, -0.021, 0.06]} rotation={[Math.PI / 2, 0, 0]} material={FIXTURE_GLOW} raycast={() => null}>
        <planeGeometry args={[0.3, 0.08]} />
      </mesh>
      <pointLight position={[0, -0.12, 0.16]} color="#ffdcab" intensity={0.55} distance={2} decay={2} />
    </group>
  )
}

// The floor under the couch — BlenderKit "Distressed traditional old rug" by Ibrohim Toxirov
// (royalty free). Exports clean, unlike the couch: one uv set, one material, real normal map,
// true metres, 15mm thick with its underside on y=0. So scale 1 and no repairs.
//
// Its long axis is Z, not X, so PI/2 turns it to run parallel to the couch — and the extra 0.12
// (7deg) is the point of it: a rug square to the walls reads as a texture painted on the floor.
// Bounded like the CASES yaw is. At 7deg the 2.80 x 1.80 footprint puts its corners at
// (-3.35,-3.68) (-0.57,-4.01) (-3.13,-1.89) (-0.35,-2.22): inside the side wall at -3.5, off the
// back wall at -4.4, clear of the lamp's flight cases (x -3.45..-3.0 at z -4.20..-3.90), and
// nowhere near the cabinet footprint (x +-0.49, z -0.29..0.39).
//
// z=-2.95 lands the back edge 0.24..0.49 under the couch's 0.90 depth — front feet on the rug,
// the rest of it spreading forward into the only floor the room camera actually frames. y=0.004
// is clearance, not levitation: coplanar with the room box's floor face it would z-fight.
//
// Anisotropy matters more here than anywhere else in the scene: this is 5m2 of texture seen at a
// grazing angle, which is the exact case trilinear filtering smears.
//
// Untinted it was worse than the couch ever was — pale sand albedo across the largest unbroken
// area in the room, sitting in the near-left third where nothing competes with it, so it read as
// the lit subject and the CRT as background. Same two knobs as COUCH_TINT/COUCH_ENV, harder: the
// tint is a warm-shifted plum rather than the couch's cold violet, because the source is
// red/tan and matching the couch exactly would have turned the whole corner into one violet mass.
// The warmth is also what ties it to the lava lamp's pool a metre away.
const RUG_TINT = '#413149'
const RUG_ENV = 0.42

function Rug({ position, rotation }: { position: [number, number, number]; rotation: [number, number, number] }) {
  const { scene, materials } = useGLTF('/models/rug.glb')
  useMemo(() => {
    const wool = materials.Material as THREE.MeshStandardMaterial
    wool.color.set(RUG_TINT)
    wool.envMapIntensity = RUG_ENV
    for (const t of [wool.map, wool.normalMap, wool.roughnessMap, wool.metalnessMap]) {
      if (t) t.anisotropy = 8
    }
  }, [materials])
  return <primitive object={scene} position={position} rotation={rotation} />
}

// Lounge seating under the left posters — BlenderKit "Fluffy Gray / White Fabric Couch
// Three-Seater" by Dennis Hafemann (royalty free). The vendor's own GLB, true metres, base at
// y=0, so it drops in at scale 1: 2.10 wide x 0.65 tall x 0.90 deep.
// The source fabric is near-white, which in this near-black room would be the brightest albedo
// in frame and pull focus off the CRT. Two knobs, both already idioms here: .color MULTIPLIES
// the basecolor map, so tinting recolours the couch without flattening the fabric weave; and
// envMapIntensity is the same occlusion-free-IBL opt-out MAT.wall / MAT.interior use.
const COUCH_TINT = '#2e2452' // dark violet, keyed to MAT.purple #6c63ff and the #171226 walls
const COUCH_ENV = 0.55

// Three fixes for how the asset exported. All of them read as rendering bugs, not style:
//  - Its textures are UV-ATLAS bakes (light islands on a black background, not tileable swatches)
//    baked against the mesh's SECOND uv set — but the glTF binds every one of them with texCoord
//    omitted, i.e. uv1. So each island sampled an arbitrary rectangle of the atlas and roughly
//    half the couch landed in the black gutters: hard-edged black patches no tint could reach.
//    `channel = 1` is the whole fix, and it has to hit the roughness map too or the same gutters
//    read as roughness 0 and throw gloss where the fabric should be matte.
//  - The COLOUR atlas is also wired into the normal slot. Sampled as tangent-space normals it
//    turns the weave into per-pixel garbage that renders as bright static.
//  - The second primitive's "Seams" material is a black-background overlay bake, which is a
//    Blender mix node flattened into a flat glTF baseColor — so it can only ever paint black.
//    Its seam lines are sub-pixel here, so the whole couch takes the fabric material instead.
function Couch({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  const { scene, materials } = useGLTF('/models/couch.glb')
  useMemo(() => {
    const fabric = materials.Fabric as THREE.MeshStandardMaterial
    fabric.color.set(COUCH_TINT)
    fabric.envMapIntensity = COUCH_ENV
    fabric.normalMap = null
    for (const t of [fabric.map, fabric.roughnessMap, fabric.metalnessMap]) {
      if (!t) continue
      t.channel = 1
      t.anisotropy = 8
    }
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.material = fabric
    })
  }, [scene, materials])
  // No raycast opt-out needed: R3F only raycasts objects that carry pointer handlers (or descend
  // from one), and this sits outside the Cabinet group — so it can't swallow the click-to-approach.
  return <primitive object={scene} position={position} rotation={rotation} />
}

// Lava lamp on a plinth, in the gap between the couch and the side wall — BlenderKit
// "Pacman Lava Lamp" by Jerry Aldrich (royalty free). The vendor GLB is a 0.42m desk piece.
// Materials: four PBR sets, all near-black in this room until the lava is made emissive.
// PBR_Plastic_Red is shared by the wax blobs AND Pac-Man's tongue, which is why the mouth
// glows too — correct for a lamp lit from inside.
//
// The pedestal is a stack of three hardshell flight cases — the thing that's actually lying
// around an arcade back room. It spends height the lamp can't have: the ninja poster's frame
// bottom edge is at y=0.887, so the whole assembly is budgeted under 0.86. Three cases take
// 0.255 and the lamp takes 0.58, which reads closer to the asset's own desk proportions than
// stretching it into a floor lamp did.
const CASE: [number, number, number] = [0.4, 0.085, 0.28]
// Yaw AND a couple of cm of lateral slop per case, bottom to top. Hand-picked and deliberately
// not a formula: a stack someone dumped there, not a machined column. Yaw alone still reads as
// a turntable — every case sharing one centre axis is the tell — so the offsets do as much of
// the work as the angles. Both are bounded: at 16° a 0.4-wide case reaches 0.231 from its own
// centre, +0.022 of offset puts its far corner at x=-3.473, inside the side wall at -3.5.
const CASES = [
  { yaw: -0.16, x: 0, z: 0 },
  { yaw: 0.28, x: 0.022, z: -0.016 },
  { yaw: -0.08, x: -0.018, z: 0.02 },
]
const TOP = CASES[CASES.length - 1] // the lamp rides the top case, not the stack's nominal axis
const LAMP_SCALE = 1.3731 // 0.58 / 0.4224 measured height. Base is already at y=0.
const LAMP_LAVA = new THREE.Color('#ff2a10')
const STACK_H = CASE[1] * CASES.length

// MAT.steel over anything darker because the floor is near-black: a dark plinth here rendered
// as a hole rather than an object. The handle is one chrome bar proud of the long face — at
// ~25px on screen a bar IS a handle, and chrome gives it the glint that sells the read.
function FlightCase({ i }: { i: number }) {
  const { yaw, x, z } = CASES[i]
  return (
    <group position={[x, CASE[1] * (i + 0.5), z]} rotation={[0, yaw, 0]}>
      <RoundedBox args={CASE} radius={0.008} smoothness={2} material={MAT.steel} />
      <RoundedBox
        args={[0.11, 0.016, 0.014]}
        radius={0.006}
        smoothness={2}
        position={[0, 0, CASE[2] / 2 + 0.007]}
        material={MAT.chrome}
      />
    </group>
  )
}

function LavaLamp({ position }: { position: [number, number, number] }) {
  const { scene, materials } = useGLTF('/models/lavalamp.glb')
  useMemo(() => {
    const lava = materials.PBR_Plastic_Red as THREE.MeshStandardMaterial
    // Bloom's luminanceThreshold is 1, so emissiveIntensity has to push past it — same trick
    // TUBE_MATS uses. This is the lamp being on, not a repair.
    lava.emissive = LAMP_LAVA
    lava.emissiveIntensity = 2.2
    lava.opacity = 0.85 // vendor 0.55 reads as smoke, not wax
  }, [materials])
  return (
    <group position={position}>
      {CASES.map((_, i) => (
        <FlightCase key={i} i={i} />
      ))}
      {/* Yawed 60°, nearly side-on to the camera, so Pac-Man looks off toward the cabinet
          instead of staring down the lens. rotation-y, not -z: -z would tip it over. */}
      <primitive object={scene} scale={LAMP_SCALE} position={[TOP.x, STACK_H, TOP.z]} rotation={[0, Math.PI / 3, 0]} />
      {/* the warm pool it throws, at wax height. pointLight not rectAreaLight — the scene
          already runs three of those, and this is a decor glow, not a key light. */}
      <pointLight position={[0, 0.66, 0.04]} color="#ff6a3a" intensity={0.9} distance={2.5} decay={2} />
    </group>
  )
}

// The right corner's answer to the couch/rug/lamp cluster on the left — BlenderKit "Snake plant in
// a pot" by Dovydas Alytas (royalty free). Vendor GLB, true metres, base at y=0, so scale 1:
// 0.65 wide x 1.28 tall x 0.57 deep.
//
// A Sansevieria specifically, and not the fiddle-leaf fig this started as. The fig was 300k
// triangles of individually-modelled leaf cards (7.65MB) and could not be decimated — gltf-transform
// simplify moved it 300,869 -> 298,831 even unconstrained by error, because every leaf is its own
// island and there is nothing to collapse. This is 11k triangles and 362KB, less than the lava lamp,
// and a snake plant is what actually survives a room lit only by a CRT.
//
// Same two knobs as COUCH_TINT/COUCH_ENV, and one atlas material covers pot, soil and blades — so
// unlike the couch there's no tinting one without the other. That turns out to be what it needed,
// because untinted BOTH ends were wrong in the same direction: the white ceramic pot picked up the
// right wall's pink tube and read as a pastel blob, the brightest albedo in the right half of the
// room; and the blades' cream variegation under the test card's #ffdcab WallLight went tan, which
// reads as a dying plant, not a lit one. A cool sage multiply pulls the pot off pink and the cream
// back to olive at once. envMapIntensity alone could not have done it — it only scales the IBL, and
// the pot is lit mostly by that WallLight, which is a real pointLight.
const PLANT_TINT = '#6f7d78'
const PLANT_ENV = 0.6

function SnakePlant({ position, rotation }: { position: [number, number, number]; rotation: [number, number, number] }) {
  const { scene, materials } = useGLTF('/models/snakeplant.glb')
  useMemo(() => {
    const atlas = materials.texture as THREE.MeshStandardMaterial
    atlas.color.set(PLANT_TINT)
    atlas.envMapIntensity = PLANT_ENV
    for (const t of [atlas.map, atlas.normalMap, atlas.roughnessMap]) {
      if (t) t.anisotropy = 8
    }
  }, [materials])
  return <primitive object={scene} position={position} rotation={rotation} />
}

// "Gym Dumbbells" by Waldemar Dad (BlenderKit, Royalty Free), 409KB. 832 triangles for the pair,
// the cheapest thing in public/models by an order of magnitude, and both dumbbells already sit on
// y=0 in the file, so this is the one import that needed no scale or lift correction.
//
// The tint knob runs the other way here, and it has to. Every other import is dielectric with a
// near-white albedo, so tinting means multiplying DOWN to stop it blowing out. This one ships as
// chrome: mean basecolor is a dark grey (~0.11 linear) and the AORM map puts metalness near 0.5,
// so half the surface has no diffuse at all and the other half starts almost black. Reflection
// can't rescue it either — a mirror in a room that is mostly unlit reflects mostly nothing, and
// scaling nothing by envMapIntensity is still nothing. At vendor settings the pair rendered as a
// faint wireframe scribble on the floor. So the tint multiplies past 1, the same trick TUBE_MATS
// and FIXTURE_GLOW use, and metalness comes down until diffuse from the ceiling Lightformer is
// carrying the shape. It is not physically honest chrome any more; it is the amount of chrome that
// survives this room.
const DUMBBELL_TINT = new THREE.Color('#aab3c6').multiplyScalar(2.6)
const DUMBBELL_ENV = 1.6
const DUMBBELL_METAL = 0.25

function Dumbbells({ position, rotation }: { position: [number, number, number]; rotation: [number, number, number] }) {
  const { scene, materials } = useGLTF('/models/dumbbells.glb')
  useMemo(() => {
    const m = materials.Dumbbells as THREE.MeshStandardMaterial
    m.color.copy(DUMBBELL_TINT)
    m.envMapIntensity = DUMBBELL_ENV
    m.metalness = DUMBBELL_METAL
    // baked AO takes another 40% off an already-dark map, on a prop too small to read the occlusion
    m.aoMapIntensity = 0.4
    for (const t of [m.map, m.normalMap, m.roughnessMap]) {
      if (t) t.anisotropy = 8
    }
  }, [materials])
  return <primitive object={scene} position={position} rotation={rotation} />
}

interface CabProps {
  stateRef: MutableRefObject<ArcadeState>
  send: (a: Action) => void
  viewRef: MutableRefObject<View>
  onEnterPlay: () => void
}

function Cabinet({ stateRef, send, viewRef, onEnterPlay }: CabProps) {
  // 3D controls only act in the play view; in the room, clicks approach the machine
  const gated = (a: Action) => {
    if (viewRef.current === 'play') send(a)
  }
  const crt = useCRT(stateRef)
  const bezel = useBezelGeometry()
  const lowerBody = useLowerBodyGeometry()
  // The tube IS the lamp: a rect area light the exact size of the screen, its output driven
  // by the pixels currently lit. Nothing else in the scene emits (except the coin button).
  const screenLight = useRef<THREE.RectAreaLight>(null!)
  const lum = useRef(0)
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    // Power-on: filament flash, two stutters, then the HV supply ramps in. A pure function of
    // scene time (the scene mounts at t=0, behind App's font gate) so it runs exactly once and
    // can never re-trigger — after 1.6s the light is steady.
    const warm =
      t < 0.06 ? 2.6 * (t / 0.06)
      : t < 0.14 ? 0.04
      : t < 0.2 ? 1.5
      : t < 0.3 ? 0.1
      : t < 1.6 ? 0.4 + 0.6 * (1 - Math.exp(-(t - 0.3) * 3.5))
      : 1
    // The screen content itself blinks (INSERT COIN toggles fully on/off at 0.8Hz, plus
    // per-frame static specks), and ^0.5 is a ~2.9x gain stage on that — which is what used to
    // pump the spill light, not the flicker term below. One-pole on the raw luminance at
    // tau=4s puts 0.8Hz at 1/sqrt(1+(2*pi*0.8*4)^2) = 5% amplitude, i.e. killed; tau=0.3 only
    // halves it. Filter BEFORE the pow. 4 is the knob; fast tau while warming so it doesn't crawl.
    const k = 1 - Math.exp(-Math.min(dt, 0.1) / (t < 1.6 ? 0.15 : 4))
    lum.current += (emission.lum - lum.current) * k
    // ponytail: +-1.8% mains hum, kept deliberately — delete both terms for dead-flat
    const flicker = 1 + Math.sin(t * 11) * 0.012 + Math.sin(t * 53) * 0.006
    // ^0.5 compresses the range: a mostly-black CRT still glows (phosphor peaks are bright)
    // 27 ≈ 46 / 1.7: the light's area grew 1.7x with the bigger tube, this keeps total spill flat
    screenLight.current.intensity = 27 * Math.pow(lum.current, 0.5) * warm * flicker
    const c = screenLight.current.color // same filter on hue, so amber->violet drifts, never snaps
    c.r += (emission.r - c.r) * k
    c.g += (emission.g - c.g) * k
    c.b += (emission.b - c.b) * k
  })

  return (
    <group
      onClick={(e) => {
        // e.delta: a portrait pan that happens to end on the machine is a look-around, not a tap
        if (e.delta > 8 || viewRef.current !== 'room') return
        e.stopPropagation()
        onEnterPlay()
      }}
      onPointerOver={() => {
        if (viewRef.current === 'room') document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        if (viewRef.current === 'room') document.body.style.cursor = 'auto'
      }}
    >
      {/* ---- marquee band ---- */}
      <RoundedBox args={[0.98, 0.2, 0.42]} radius={0.015} smoothness={4} position={[0, 1.7, -0.06]} material={MAT.body} />
      <group position={[0, 1.7, 0.152]}>
        {/* black, matte and unlit so the artwork's own black background blends into the panel.
            MeshBasic ignores the marquee lights, which would otherwise wash this back to grey. */}
        <mesh>
          <planeGeometry args={[0.86, 0.15]} />
          <meshBasicMaterial color="#000000" toneMapped={false} />
        </mesh>
        {/* backlit sign: the acrylic glows, and it lights the cabinet like a real marquee */}
        <rectAreaLight position={[0, 0, 0.02]} rotation={[0, Math.PI, 0]} width={0.86} height={0.15} intensity={1.5} color={MARQUEE_GLOW} />
        <rectAreaLight
          position={[0, -0.085, 0.03]}
          rotation={[(-110 * Math.PI) / 180, 0, 0]}
          width={0.86}
          height={0.09}
          intensity={0.9}
          color={MARQUEE_GLOW}
        />
        {/* the board wears its own sign — a Threads challenge board is not the X top 100 */}
        <MarqueeArt
          src={getPlatform() === 'threads' ? '/marquee-threads.webp' : '/marquee.webp'}
          width={0.86}
          position={[0, 0, 0.009]}
        />
      </group>

      {/* ---- shadowbox recess: one seamless beveled bezel with a flared rounded hole ---- */}
      <mesh geometry={bezel} position={[0, 1.27, 0.04]} material={[MAT.ink, MAT.interior]} />
      {/* reclined CRT group: purple wall + glow halo + tube */}
      <group position={[0, 1.27, -0.09]} rotation={[-0.15, 0, 0]}>
        <mesh position={[0, 0.01, -0.09]} material={MAT.wall}>
          <boxGeometry args={[0.98, 0.84, 0.02]} />
        </mesh>
        <mesh onClick={() => gated({ t: 'COIN' })}>
          <planeGeometry args={[0.86, 0.645]} />
          <primitive object={crt} attach="material" />
        </mesh>
        {/* tube glass: black dielectric rendered additively, so only the env-map specular
            survives — a real Fresnel sheen that shifts with the camera sway. One quad, no
            extra lights or render targets. */}
        <mesh position={[0, 0, 0.006]} raycast={() => null}>
          <planeGeometry args={[0.86, 0.645]} />
          <meshStandardMaterial
            color="#000000"
            roughness={0.16}
            metalness={0}
            envMapIntensity={2.2}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <rectAreaLight
          ref={screenLight}
          position={[0, 0, 0.012]}
          rotation={[0, Math.PI, 0]}
          width={0.86}
          height={0.645}
          intensity={8}
        />
      </group>

      {/* ---- structure: full-height side walls, top cap, dark backbone ---- */}
      <RoundedBox args={[0.12, 1.8, 0.44]} radius={0.015} smoothness={4} position={[-0.55, 0.93, -0.05]} material={MAT.cheek} castShadow />
      <RoundedBox args={[0.12, 1.8, 0.44]} radius={0.015} smoothness={4} position={[0.55, 0.93, -0.05]} material={MAT.cheek} castShadow />
      <RoundedBox args={[1.18, 0.08, 0.46]} radius={0.015} smoothness={4} position={[0, 1.83, -0.05]} material={MAT.cheek} castShadow />
      <mesh position={[0, 0.94, -0.29]} material={MAT.ink}>
        <boxGeometry args={[1.08, 1.76, 0.05]} />
      </mesh>

      {/* ---- one-piece lower body: deck slope, nose, front, kick ---- */}
      <mesh geometry={lowerBody} material={[MAT.cheek, MAT.deck]} castShadow />
      <group position={[0, 0.925, 0.19]} rotation={[-0.1, 0, 0]}>
        <mesh position={[0, 0.037, 0.192]} material={MAT.chrome}>
          <boxGeometry args={[0.97, 0.01, 0.012]} />
        </mesh>
        <PanelSticker />
        <Joystick send={gated} />
        <PushButton x={0.12} color={MAT.purple} action={{ t: 'SELECT' }} send={gated} acts={['SELECT']} />
        <PushButton x={0.27} color={MAT.cream} action={{ t: 'BACK' }} send={gated} acts={['BACK']} />
      </group>

      {/* ---- lower front + glowing coin button ---- */}

      <group position={[0, 0.62, 0.382]}>
        <RoundedBox args={[0.22, 0.22, 0.02]} radius={0.008} smoothness={3} position={[0, 0, -0.006]} material={MAT.ink} />
        <mesh rotation={[Math.PI / 2, 0, 0]} material={MAT.ink}>
          <cylinderGeometry args={[0.045, 0.048, 0.012, 24]} />
        </mesh>
        <mesh
          rotation={[Math.PI / 2, 0, 0]}
          onClick={() => gated({ t: 'COIN' })}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = 'auto')}
        >
          <cylinderGeometry args={[0.034, 0.037, 0.02, 24]} />
          <meshStandardMaterial color="#171338" emissive="#8b7cff" emissiveIntensity={1.15} />
        </mesh>
        {/* the button casts its own pool of light on the panel */}
        <pointLight position={[0, 0, 0.04]} color="#8b7cff" intensity={0.17} distance={0.5} decay={2} />
      </group>
    </group>
  )
}

interface SceneProps {
  stateRef: MutableRefObject<ArcadeState>
  send: (a: Action) => void
  view: View
  viewRef: MutableRefObject<View>
  onEnterPlay: () => void
  poster: number
  onEnterPoster: (i: number) => void
}

export function FrontalScene({ stateRef, send, view, viewRef, onEnterPlay, poster, onEnterPoster }: SceneProps) {
  const lowPerf = useMemo(() => matchMedia('(pointer: coarse)').matches, [])
  return (
    <Canvas shadows dpr={lowPerf ? [1, 1.5] : [1, 2]} camera={{ fov: 44, position: [0, 1.3, 3.2], near: 0.1, far: 12 }}>
      <CameraRig view={view} poster={poster} />
      {/* The game room, as an env map. This rig is the ONLY thing lighting the metal chassis —
          what you see reflected in the body IS these quads. Lightformer is an unlit DoubleSide
          basic material, so intensity is literally the captured pixel value (>1 = a real
          highlight) and the rotations set solid angle from the cube camera, not facing: an
          unrotated plane overhead is edge-on and contributes nothing. frames={1} bakes once. */}
      <Environment resolution={128} frames={1}>
        {/* broad ceiling wash: turns the cabinet from a silhouette into a solid object */}
        <Lightformer intensity={1.6} color="#cfd6ff" position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[9, 6, 1]} />
        {/* two fluorescent tubes: the specular streaks on the top cap and cheeks. x matches the
            white pair in NEON_RUNS (front-to-back at ±1.6) so reflection and fixture agree. */}
        <Lightformer intensity={2} color="#ffffff" position={[1.6, 2.3, 0]} rotation-x={Math.PI / 2} scale={[0.3, 7, 1]} />
        <Lightformer intensity={1.4} color="#ffffff" position={[-1.6, 2.3, 0]} rotation-x={Math.PI / 2} scale={[0.3, 7, 1]} />
        {/* neon side walls: the cabinet's vertical edge highlights, and the only thing that
            ever makes cheek's clearcoat visible */}
        <Lightformer intensity={1.3} color="#ff5ec8" position={[-4, 1.4, 0.3]} rotation-y={Math.PI / 2} scale={[7, 3, 1]} />
        <Lightformer intensity={1} color="#4ad9ff" position={[4, 1.4, 0.3]} rotation-y={-Math.PI / 2} scale={[7, 3, 1]} />
        {/* front fill: the only thing lighting the near-black lower body and coin door, which
            would otherwise read as a hole rather than part of the machine */}
        <Lightformer intensity={0.7} color="#93a4c8" position={[0, 1.2, 5]} scale={[7, 4, 1]} />
        {/* fluorescent tube behind the play camera — THE thing the tube glass reflects when
            zoomed in. Placement is by mirror angle, not eye: the play pose sees reflected
            elevations of -11°..+22° across the glass, so ~11° (y/z = 0.2) lands the streak
            on the upper third of the screen in both poses. */}
        <Lightformer intensity={3} color="#eef2ff" position={[0, 0.8, 4]} scale={[3.5, 0.3, 1]} />
      </Environment>
      {/* barely touches the metal body, but fully touches ink/interior/wall — so raising this
          trades directly against the shadowbox contrast the CRT reads against */}
      <ambientLight intensity={0.05} />
      <Cabinet stateRef={stateRef} send={send} viewRef={viewRef} onEnterPlay={onEnterPlay} />
      {/* the room: one inside-out box = dark floor + walls + ceiling. Floor lands on y=0 (the
          cabinet's base plane); depth 8 keeps the opening camera (z=3.2) inside the near wall.
          Wall colour + the ceiling Lightformer are the two "how visible is the room" knobs. */}
      <mesh position={[0, CEILING_Y / 2, -0.4]} material={ROOM}>
        <boxGeometry args={[ROOM_W, CEILING_Y, 8]} />
      </mesh>
      {NEON_RUNS.map((run, i) => (
        <NeonRun key={i} {...run} />
      ))}
      {/* a poster on each side of the machine, sharing HANG_TOP, each under a fixture.
          The cabinet hides |x| < ~2.05 of the back wall, and the wall ends at 3.5 — so each side
          has ~1.4 of usable width, which is what caps the poster sizes. Positions in POSTERS. */}
      {POSTERS.map((p, i) => (
        <Fragment key={p.src}>
          <Framed {...p} viewRef={viewRef} onEnter={() => onEnterPoster(i)} />
          <WallLight x={p.position[0]} />
        </Fragment>
      ))}
      {/* Back flush to the back wall, right end at x=-0.80 so it disappears behind the cabinet —
          furniture in a room, not a prop on a turntable. Its 0.65 height clears the posters above
          (their bottom edges are at 0.87 and 0.92). Pushed 0.59 off the side wall to leave the
          lamp a corner: the couch's left arm now sits at -2.90, the lamp fills -3.5..-2.90. */}
      <Rug position={[-1.85, 0.004, -2.95]} rotation={[0, Math.PI / 2 + 0.12, 0]} />
      <Couch position={[-1.85, 0, -3.94]} />
      <LavaLamp position={[-3.22, 0, -4.05]} />
      {/* Back-right corner, the one bit of floor with nothing on it. Yawed 0.22 rotates its bbox to
          x -0.404..0.353 / z -0.320..0.378, so these two numbers are 3cm off both walls (x 3.5,
          back wall -4.4) and it occupies x 2.71..3.47, z -4.37..-3.67. Small yaw on purpose: every
          extra radian swings the crown further out of the corner and across the test card.
          Clear of the right-wall neon, which is the tight one: the first diagonal descends
          y 2.34 -> -0.35 across z -3.9 -> -2.678 at x=3.44, so at the plant's rearmost z=-3.67 the
          tube is still up at y~2.02, and by the time it drops to the plant's 1.28 top it has moved
          on to z~-3.42, a quarter-metre past the front of the pot. */}
      <SnakePlant position={[3.11, 0, -4.05]} rotation={[0, 0.22, 0]} />
      {/* Right-front floor: the last empty quadrant, and the counterweight to the lamp/couch mass
          in the opposite corner. x is set by the cabinet's silhouette, not by the room — the lower
          body is near enough the camera that its front face covers out to screen x~940 of 1280, so
          anything inside x~1.5 sits behind the machine however clear the floor is. 2.0 puts the
          pair in open frame, with the plant safely further back at z -3.67.
          Don't tune this for portrait. At pos.z 2.7 / fov 54 a phone crop is almost all cabinet and
          no floor prop survives it — not the rug, not the lava lamp, not this.
          Yaw -0.9 is the one that reads as weights. The two dumbbells are modelled perpendicular to
          each other, so one is always end-on; at small yaws both present their discs to camera, the
          discs catch the pink wall Lightformer flat, and the pair reads as a set of headphones.
          -0.9 swings the larger one side-on so the knurled handle shows and the silhouette is a
          bar, which is the part that says dumbbell. */}
      <Dumbbells position={[2.0, 0, -2.1]} rotation={[0, -0.9, 0]} />
      {/* Post runs on mobile too — without it the neon runs and the CRT are flat bands, which is
          most of the room's look. The only mobile saving is dropping MSAA on the HDR target;
          dpr already caps at 1.5, and Noise/Vignette/ToneMapping merge into a single EffectPass
          so cutting them buys nothing. Bloom has no cheap mode worth having: resolutionScale is
          inert once mipmapBlur is on (it only sizes the legacy Kawase path).
          crt.tsx depends on this composer existing — it outputs linear and lets the final pass
          do the sRGB encode. Re-gating this behind !lowPerf means fixing that too. */}
      <EffectComposer multisampling={lowPerf ? 0 : 8}>
        {/* threshold 1 keeps the CRT/marquee/coin cap the only things that bloom — lowering it
            is what would demote the tube from hero */}
        <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.3} intensity={0.75} />
        <Noise opacity={0.055} />
        <Vignette offset={0.3} darkness={0.5} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  )
}
