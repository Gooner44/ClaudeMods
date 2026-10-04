// Clawd, the little Claude Code character, as pixel art for a terminal Raster: two pixels a cell
// (the upper and lower half of a block), so a 12×8-pixel sprite is 12 columns by 4 rows.
// '#' body, 'o' eye, '-' closed eye, '.' empty.

export const SPRITE_COLUMNS = 12
export const SPRITE_ROWS = 4

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
  [
    '..########..',
    '..########..',
    '..#o####o#..',
    '############',
    '..########..',
    '..########..',
    '..#.#..#.#..',
    '..#.#..#.#..',
  ],
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
  [
    '..########..',
    '..########..',
    '..#o####o#..',
    '############',
    '..########..',
    '..########..',
    '..#.#..#.#..',
    '..#.#..#.#..',
  ],
]

const BLINK = STAND.map((row, i) => (i === 2 ? row.replace(/o/g, '-') : row))

const DEFAULT = 0x01000000
const EYE = 0x1a1a1a
export const ORANGE = 0xd77757
export const DIM = 0x8c6a5f

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

// One frame's cells: each cell is the pixel pair above and below as ▀ (top drawn, bottom as
// the background), ▄ when only the bottom is drawn, or a blank.
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

// The frame for a tick: working sprites cycle the walk; idle ones stand, blinking now and then.
export function frameFor(isWorking: boolean, tick: number, seed: number): readonly string[] {
  if (isWorking) return WORK[(tick + seed) % WORK.length]!
  return (tick + seed * 7) % 16 === 0 ? BLINK : STAND
}

// The same character in text, for a surface with no Raster.
export const GLYPH = '▐▛█▜▌'
