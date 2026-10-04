import { expect, test } from 'claude-code/testing'

import { ORANGE, SPRITE_COLUMNS, SPRITE_ROWS, cells, frameFor } from './sprite'

test('every frame packs to one full Raster of cells', () => {
  const bytes = SPRITE_COLUMNS * SPRITE_ROWS * 3 * 4
  for (let tick = 0; tick < 16; tick++) {
    for (const isWorking of [true, false]) {
      const frame = frameFor(isWorking, tick, 3)
      expect(frame.length).toBe(SPRITE_ROWS * 2)
      for (const row of frame) expect(row.length).toBe(SPRITE_COLUMNS)
      expect(cells(frame, ORANGE).length).toBe(Math.ceil(bytes / 3) * 4)
    }
  }
})

test('a working sprite moves and an idle one mostly stands still', () => {
  expect(frameFor(true, 0, 0)).not.toEqual(frameFor(true, 1, 0))
  expect(frameFor(false, 1, 0)).toEqual(frameFor(false, 2, 0))
})
