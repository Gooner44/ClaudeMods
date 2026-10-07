import { expect, test } from 'claude-code/testing'

import { PRIORITIES, brief } from './brief'

test('compaction gets the priorities, after anything typed with /compact', () => {
  expect(brief()).toBe(PRIORITIES)
  expect(brief('  ')).toBe(PRIORITIES)
  expect(brief('Keep the deploy steps.')).toBe(`Keep the deploy steps.\n\n${PRIORITIES}`)
})

test('the priorities put the user first and tool output last', () => {
  const at = (s: string) => PRIORITIES.indexOf(s)
  expect(at("The user's own words matter most")).toBeGreaterThan(-1)
  expect(at("The user's own words")).toBeLessThan(at('lasting effect'))
  expect(at('lasting effect')).toBeLessThan(at('tool calls and their output'))
})
