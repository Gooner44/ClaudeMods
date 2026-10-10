import { expect, test } from 'claude-code/testing'

import { SMALL_H, SMALL_W, SPRITE_COLUMNS, SPRITE_ROWS, SVG_W, cells, frameFor, modelColor, modelName, svgClawd } from './sprite'

test('a small working figure is drawn smaller and paces; an idle one stands still', () => {
  const busy = svgClawd({ model: 'claude-sonnet-5-5', isWorking: true, seed: 3, title: 'Explore', isSmall: true })
  expect(busy.includes(`width="${SMALL_W}" height="${SMALL_H}"`)).toBe(true)
  expect(busy.includes('animateTransform')).toBe(true)
  const idle = svgClawd({ model: 'claude-sonnet-5-5', isWorking: false, seed: 3, title: 'Explore', isSmall: true })
  expect(idle.includes('animateTransform')).toBe(false)
  expect(svgClawd({ model: 'claude-sonnet-5-5', isWorking: true, seed: 3, title: 'Claude' }).includes(`width="${SVG_W}"`)).toBe(true)
})

test('every terminal frame packs to one full Raster of cells', () => {
  const bytes = SPRITE_COLUMNS * SPRITE_ROWS * 3 * 4
  for (let tick = 0; tick < 16; tick++) {
    for (const isWorking of [true, false]) {
      const frame = frameFor(isWorking, tick, 3)
      expect(frame.length).toBe(SPRITE_ROWS * 2)
      for (const row of frame) expect(row.length).toBe(SPRITE_COLUMNS)
      expect(cells(frame, 0xd77757).length).toBe(Math.ceil(bytes / 3) * 4)
    }
  }
})

test('a working sprite moves and an idle one mostly stands still', () => {
  expect(frameFor(true, 0, 0)).not.toEqual(frameFor(true, 1, 0))
  expect(frameFor(false, 1, 0)).toEqual(frameFor(false, 2, 0))
})

test('models get their own colour and a short name', () => {
  expect(modelColor('claude-opus-5-5')).not.toBe(modelColor('claude-fable-5-1'))
  expect(modelName('claude-fable-5-1')).toBe('Fable 5.1')
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
})

test('the SVG glows by effort and flames only at ultracode', () => {
  const svg = (effort?: string) => svgClawd({ model: 'opus', effort, isWorking: true, seed: 1, title: 'a <b>' })
  expect(svg(undefined)).not.toContain('feGaussianBlur')
  expect(svg('low')).toContain('opacity="0.3"')
  expect(svg('max')).not.toContain('radialGradient')
  expect(svg('ultracode')).toContain('radialGradient')
  expect(svg('high')).toContain('a &#60;b&#62;')
  expect(svg('high').length).toBeLessThan(131072)
})

test('the bubble shows what the session wants and fades to half', () => {
  const svg = (bubble?: boolean | 'reply' | 'permission' | 'question', isFaded?: boolean) =>
    svgClawd({ model: 'opus', isWorking: false, seed: 1, title: 't', bubble, isFaded })
  expect(svg()).not.toContain('#e5484d')
  expect(svg(true)).toBe(svg('reply'))
  expect(svg('permission')).toContain('#e5484d')
  expect(svg('question')).toContain('#f5b301')
  expect(svg('permission', true)).toContain('opacity="0.5"')
  expect(svg('permission')).not.toContain('<g opacity="0.5"')
})
