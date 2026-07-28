// Live CRT: offscreen canvas -> CanvasTexture -> barrel-warp shader material,
// applied to whatever screen mesh the cabinet provides. Redrawn every frame.
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { MutableRefObject } from 'react'
import type { ArcadeState } from '../state'
import { draw, SCREEN_W, SCREEN_H } from '../screen/render'

const TEX_W = 1024
const TEX_H = 768

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

// Lottes-style barrel warp + fwidth-faded scanlines + screen-space shadow mask.
// Outputs LINEAR, on every device: the composer now runs on mobile too, so this always renders
// into its half-float buffer and the final pass owns the sRGB encode. Doing it here as well
// (which the old no-composer mobile path had to) would double-encode and wash the tube out.
const FRAG = /* glsl */ `
uniform sampler2D tex;
uniform float dpr;
uniform float linesN;
uniform float bright;
varying vec2 vUv;

vec2 warp(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  uv *= vec2(1.0 + uv.y * uv.y * 0.042, 1.0 + uv.x * uv.x * 0.056);
  return uv * 0.5 + 0.5;
}
float corner(vec2 uv) {
  vec2 c = min(uv, 1.0 - uv) * vec2(1.3333, 1.0); // physical space (4:3)
  vec2 d = max(vec2(0.075) - c, vec2(0.0));
  return clamp((0.075 - length(d)) * 110.0, 0.0, 1.0);
}
void main() {
  vec2 w = warp(vUv);
  vec3 col = vec3(0.0);
  if (all(greaterThanEqual(w, vec2(0.0))) && all(lessThanEqual(w, vec2(1.0)))) {
    float ca = 0.0012;
    col.r = texture2D(tex, w + vec2(ca, 0.0)).r;
    col.g = texture2D(tex, w).g;
    col.b = texture2D(tex, w - vec2(ca, 0.0)).b;

    float fade = 1.0 - smoothstep(0.35, 0.7, fwidth(w.y * linesN));
    float scan = 0.5 + 0.5 * sin(w.y * linesN * 6.28318);
    float amp = 0.22 * fade;
    col *= 1.0 - amp + amp * scan;

    vec2 fc = gl_FragCoord.xy / dpr;
    fc.x += fc.y * 3.0;
    float x = fract(fc.x / 6.0);
    vec3 mask = vec3(0.84);
    if (x < 0.333) mask.r = 1.16; else if (x < 0.666) mask.g = 1.16; else mask.b = 1.16;
    col *= mix(vec3(1.0), mask, 0.45 * fade);

    col *= pow(16.0 * w.x * w.y * (1.0 - w.x) * (1.0 - w.y), 0.3);
    col *= corner(w);
  }
  gl_FragColor = vec4(clamp(col * bright, vec3(0.0), vec3(3.0)), 1.0);
}`

// The screen's actual light output, sampled from its pixels: this is what lights the cabinet.
// A CRT is an area emitter — its brightness and hue are whatever is currently on screen.
export const emission = { r: 1, g: 0.94, b: 0.86, lum: 0 }

const SW = 8
const SH = 6
let sampler: CanvasRenderingContext2D | null = null

function sampleEmission(source: HTMLCanvasElement) {
  if (!sampler) {
    const c = document.createElement('canvas')
    c.width = SW
    c.height = SH
    sampler = c.getContext('2d', { willReadFrequently: true })
  }
  if (!sampler) return
  sampler.drawImage(source, 0, 0, SW, SH)
  const d = sampler.getImageData(0, 0, SW, SH).data
  let r = 0
  let g = 0
  let b = 0
  for (let i = 0; i < d.length; i += 4) {
    // sRGB -> ~linear so a mostly-black screen doesn't read as half-lit
    r += (d[i] / 255) ** 2.2
    g += (d[i + 1] / 255) ** 2.2
    b += (d[i + 2] / 255) ** 2.2
  }
  const n = (d.length / 4) || 1
  r /= n
  g /= n
  b /= n
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // normalize hue so intensity carries brightness, colour carries tint
  const peak = Math.max(r, g, b, 1e-4)
  emission.r = r / peak
  emission.g = g / peak
  emission.b = b / peak
  emission.lum = lum
}

export function useCRT(stateRef: MutableRefObject<ArcadeState>): THREE.ShaderMaterial {
  const lowPerf = useMemo(() => matchMedia('(pointer: coarse)').matches, [])

  const { material, ctx, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = TEX_W
    canvas.height = TEX_H
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(TEX_W / SCREEN_W, 0, 0, TEX_H / SCREEN_H, 0, 0) // logical 640x480 coords
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.generateMipmaps = false
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.NearestFilter // crisp pixel glyphs when the POV camera magnifies
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tex: { value: texture },
        dpr: { value: Math.min(devicePixelRatio, lowPerf ? 1.5 : 2) },
        linesN: { value: 300 },
        bright: { value: 1.35 },
      },
    })
    return { material, ctx, texture }
  }, [lowPerf])

  // ponytail: full redraw + upload every frame; dirty-flag only if mobile profiling demands it
  const frame = useRef(0)
  useFrame(({ clock }) => {
    draw(ctx, stateRef.current, clock.elapsedTime)
    texture.needsUpdate = true
    if (frame.current++ % 4 === 0) sampleEmission(ctx.canvas)
  })

  return material
}
