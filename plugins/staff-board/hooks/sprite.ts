// Clawd, the little Claude Code character, as pixel art: a 12×8-pixel sprite drawn as SVG on the
// desktop app (animated by SMIL, so no frame timer), and a 10×4-pixel one for a terminal Raster
// (two pixels a cell, the upper and lower half of a block, so 10 columns by 2 rows).
// '#' body, 'o' eye, '-' closed eye, '.' empty.

// The SVG sprite.
const STAND = [
  '..########..',
  '..########..',
  '..#o####o#..',
  '############',
  '..########..',
  '..########..',
  '..#.#..#.#..',
  '..#.#..#.#..',
]

// Working: arms up and down, legs stepping, eyes glancing left and right.
const WORK = [
  [
    '..########..',
    '#.########.#',
    '#.o####o##.#',
    '############',
    '..########..',
    '..########..',
    '..#.#..#.#..',
    '...#.#..#.#.',
  ],
  STAND,
  [
    '..########..',
    '#.########.#',
    '#.##o####o.#',
    '############',
    '..########..',
    '..########..',
    '..#.#..#.#..',
    '.#.#..#.#...',
  ],
  STAND,
]

// The terminal sprite: the same character at half the height.
export const SPRITE_COLUMNS = 10
export const SPRITE_ROWS = 2

const MINI_STAND = ['.########.', '.#o####o#.', '##########', '.#.#..#.#.']
const MINI_WORK = [
  ['#########.', '#.o####o##', '.#########', '..#.#..#.#'],
  MINI_STAND,
  ['.#########', '##o####o.#', '#########.', '#.#..#.#..'],
  MINI_STAND,
]
const MINI_BLINK = MINI_STAND.map((row, i) => (i === 1 ? row.replace(/o/g, '-') : row))

const DEFAULT = 0x01000000
const EYE = 0x1a1a1a

// Model colours: the body is the model, so who is on what reads at a glance.
const MODELS: [RegExp, number, string][] = [
  [/fable/i, 0xa07be0, 'Fable'],
  [/opus/i, 0xd77757, 'Opus'],
  [/sonnet/i, 0x4f8fe0, 'Sonnet'],
  [/haiku/i, 0x3fae6a, 'Haiku'],
]
const OTHER = 0x9a9a9a
export const modelColor = (model?: string) => MODELS.find(([re]) => re.test(model ?? ''))?.[1] ?? OTHER
export const modelName = (model?: string) => {
  const hit = MODELS.find(([re]) => re.test(model ?? ''))
  if (!hit) return model ?? ''
  const ver = (model ?? '').match(/(\d+)[-.](\d+)/)
  return ver ? `${hit[2]} ${ver[1]}.${ver[2]}` : hit[2]
}
export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

// An idle character fades toward the background.
export const dimmed = (rgb: number) => {
  const mix = (shift: number) => Math.round(((rgb >> shift) & 255) * 0.55 + 0x80 * 0.45)
  return (mix(16) << 16) | (mix(8) << 8) | mix(0)
}

// A closed eye ('-') is body colour: the eyes vanish for one tick.
const fill = (ch: string, body: number) => (ch === '#' || ch === '-' ? body : ch === 'o' ? EYE : DEFAULT)

// Standard padded base64 of the bytes (the hooks environment has no Buffer).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

// One terminal frame's cells: each cell is the pixel pair above and below as ▀ (top drawn,
// bottom as the background), ▄ when only the bottom is drawn, or a blank.
export function cells(frame: readonly string[], body: number): string {
  const words = new Uint32Array(SPRITE_COLUMNS * SPRITE_ROWS * 3)
  let w = 0
  for (let r = 0; r < SPRITE_ROWS; r++) {
    for (let c = 0; c < SPRITE_COLUMNS; c++) {
      const top = fill(frame[r * 2]?.[c] ?? '.', body)
      const bot = fill(frame[r * 2 + 1]?.[c] ?? '.', body)
      if (top === DEFAULT && bot === DEFAULT) words.set([0x20, DEFAULT, DEFAULT], w)
      else if (top === DEFAULT) words.set([0x2584, bot, DEFAULT], w)
      else words.set([0x2580, top, bot], w)
      w += 3
    }
  }
  return base64(new Uint8Array(words.buffer))
}

// The terminal frame for a tick: working sprites cycle the walk; idle ones stand, blinking now and then.
export function frameFor(isWorking: boolean, tick: number, seed: number): readonly string[] {
  if (isWorking) return MINI_WORK[(tick + seed) % MINI_WORK.length]!
  return (tick + seed * 7) % 16 === 0 ? MINI_BLINK : MINI_STAND
}

// Effort as a glow around the character, in the model's colour: barely there at low, brighter
// and wider up to max, and at ultracode a flickering aura with flames off the top.
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode'] as const
const GLOW: Record<string, { spread: number; blur: number; opacity: number }> = {
  low: { spread: 0.3, blur: 0.6, opacity: 0.3 },
  medium: { spread: 0.7, blur: 0.9, opacity: 0.55 },
  high: { spread: 1.1, blur: 1.1, opacity: 0.75 },
  xhigh: { spread: 1.5, blur: 1.3, opacity: 0.9 },
  max: { spread: 2, blur: 1.5, opacity: 1 },
  ultracode: { spread: 2, blur: 1.6, opacity: 1 },
}

// Light, not paint: the glow is the model's colour lifted toward white.
const lighten = (rgb: number, by: number) => {
  const mix = (shift: number) => Math.round(((rgb >> shift) & 255) * (1 - by) + 255 * by)
  return (mix(16) << 16) | (mix(8) << 8) | mix(0)
}

// One frame's pixels as rects, a run of like pixels on a row as one rect.
function rects(frame: readonly string[], body: string, withEyes = true): string {
  let out = ''
  frame.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const ch = row[x]!
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      const color = ch === '#' || ch === '-' ? body : ch === 'o' ? (withEyes ? '#1a1a1a' : body) : ''
      if (color) out += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${color}"/>`
      x = end
    }
  })
  return out
}

// Shows one of `n` groups at a time, stepping every `step` seconds; `phase` offsets the start.
const flip = (i: number, n: number, step: number, phase: number) => {
  const values = Array.from({ length: n }, (_, k) => (k === i ? 'visible' : 'hidden')).join(';')
  return `<animate attributeName="visibility" values="${values}" dur="${n * step}s" begin="-${phase.toFixed(2)}s" calcMode="discrete" repeatCount="indefinite"/>`
}

export const SVG_W = 36
export const SVG_H = 24

// The SVG character: the model's colour, the effort's glow, walking while it works.
export function svgClawd(opts: { model?: string; effort?: string; isWorking: boolean; seed: number; title: string; bubble?: boolean }): string {
  const rgb = modelColor(opts.model)
  const color = hex(rgb)
  const body = hex(opts.isWorking ? rgb : dimmed(rgb))
  const effort = opts.effort && GLOW[opts.effort] ? opts.effort : undefined
  const glow = effort ? GLOW[effort]! : undefined
  const isUltra = effort === 'ultracode'
  const phase = (opts.seed % 10) * 0.13
  const frames = opts.isWorking ? WORK : [STAND]

  // The sprite sits at 0..12 × 0..8 in a viewBox with room for the glow (and flames) around it.
  let defs = ''
  let back = ''
  if (glow) {
    defs += `<filter id="g" x="-80%" y="-80%" width="260%" height="260%"><feMorphology operator="dilate" radius="${glow.spread}"/><feGaussianBlur stdDeviation="${glow.blur}"/></filter>`
    const pulse = opts.isWorking
      ? `<animate attributeName="opacity" values="${glow.opacity};${(glow.opacity * 0.6).toFixed(2)};${glow.opacity}" dur="1.6s" repeatCount="indefinite"/>`
      : ''
    back += `<g filter="url(#g)" opacity="${opts.isWorking ? glow.opacity : (glow.opacity * 0.6).toFixed(2)}">${pulse}${rects(STAND, hex(lighten(rgb, 0.35)), false)}</g>`
  }
  if (isUltra) {
    // Super Saiyan: a gold-and-model aura that flickers, and flames licking up off the head.
    defs +=
      `<radialGradient id="a"><stop offset="0" stop-color="#fff3b0" stop-opacity="0.9"/>` +
      `<stop offset="0.45" stop-color="#ffd23f" stop-opacity="0.65"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`
    const flicker = `<animate attributeName="opacity" values="0.75;1;0.6;0.95;0.75" dur="0.9s" repeatCount="indefinite"/>`
    // Spiky flames off the head and shoulders, each flickering its own height.
    const flame = (x: number, h: number, lean: number, d: number) => {
      const tip = (k: number) => `M${x - 1.1} 1.5 L${x + lean * k} ${(1.5 - h * k).toFixed(2)} L${x + 1.1} 1.5 Z`
      const anim = `<animate attributeName="d" values="${tip(1)};${tip(0.65)};${tip(1.1)};${tip(1)}" dur="${d}s" repeatCount="indefinite"/>`
      return `<path d="${tip(1)}" fill="#ffc81e">${anim}</path>`
    }
    back =
      `<ellipse cx="6" cy="4.5" rx="8.5" ry="7" fill="url(#a)">${flicker}</ellipse>` +
      back +
      flame(1.5, 3.2, -1.2, 0.45) + flame(4, 4.6, -0.5, 0.38) + flame(6, 5.4, 0, 0.5) + flame(8, 4.6, 0.5, 0.42) + flame(10.5, 3.2, 1.2, 0.47)
  }

  const groups = frames
    .map((f, i) => `<g visibility="${i === 0 ? 'visible' : 'hidden'}">${frames.length > 1 ? flip(i, frames.length, 0.3, phase) : ''}${rects(f, body)}</g>`)
    .join('')
  // An idle character blinks: body-coloured lids over the eyes for a moment every few seconds.
  const blink = opts.isWorking
    ? ''
    : `<g visibility="hidden"><animate attributeName="visibility" values="hidden;visible" keyTimes="0;0.96" dur="4.2s" begin="-${(phase * 3).toFixed(2)}s" calcMode="discrete" repeatCount="indefinite"/>` +
      `<rect x="3" y="2" width="1" height="1" fill="${body}"/><rect x="8" y="2" width="1" height="1" fill="${body}"/></g>`
  // A reply waiting to be read: a little pixel speech bubble off the top-right of the head.
  const bubble = opts.bubble
    ? `<g><rect x="10.8" y="-4.4" width="5.2" height="3.2" fill="#ffffff" stroke="#8a8a8a" stroke-width="0.35"/>` +
      `<rect x="11.2" y="-1.4" width="1.2" height="1.1" fill="#ffffff"/><rect x="10.9" y="-1.2" width="0.35" height="1.1" fill="#8a8a8a"/>` +
      `<rect x="12" y="-3.1" width="0.8" height="0.8" fill="#1a1a1a"/><rect x="13.2" y="-3.1" width="0.8" height="0.8" fill="#1a1a1a"/><rect x="14.4" y="-3.1" width="0.8" height="0.8" fill="#1a1a1a"/></g>`
    : ''
  const title = opts.title.replace(/[<&>"]/g, ch => `&#${ch.charCodeAt(0)};`)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4.5 -4.6 21 14" width="${SVG_W}" height="${SVG_H}" shape-rendering="crispEdges" style="color-scheme:light dark;background:transparent">` +
    // The interactive drawing sits in its own frame; a frame whose colour scheme differs from the
    // app's gets an opaque white backdrop in dark mode, so the SVG takes whichever scheme the app has.
    `<style>:root{color-scheme:light dark;background:transparent}</style><title>${title}</title><defs>${defs}</defs>${back}${groups}${blink}${bubble}</svg>`
  )
}

// The same character in text, for a surface with neither Svg nor Raster.
export const GLYPH = '▐▛█▜▌'
