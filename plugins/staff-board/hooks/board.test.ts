import { expect, test } from 'claude-code/testing'

import type { BoardCard } from '../types'
import { asText, describe, liveCards, summary } from './board'

const NOW = 1_800_000_000_000
const card = (over: Partial<BoardCard>): BoardCard => ({
  session: 's',
  name: 'Claude',
  isJob: false,
  model: 'opus',
  cwd: '/vault',
  status: 'idle',
  agents: [],
  startedAt: NOW - 60_000,
  updatedAt: NOW - 1_000,
  ...over,
})

test('a tool call reads as a few words', () => {
  expect(describe('Edit', { file_path: 'C:\\vault\\hooks\\register.tsx' })).toBe('Edit register.tsx')
  expect(describe('Bash', { command: 'git push', description: 'Push the vault' })).toBe('Bash: Push the vault')
  expect(describe('mcp__memmachine__search_memory', {})).toBe('memmachine: search_memory')
})

test('the board keeps live sessions only, standing ones first', () => {
  const cards = [
    card({ session: 'me' }),
    card({ session: 'job', name: 'Quinn', isJob: true }),
    card({ session: 'gone', name: 'Old', updatedAt: NOW - 600_000 }),
    card({ session: 'done', name: 'Done', status: 'ended' }),
    card({ session: 'a', name: 'Aesop', status: 'working' }),
  ]
  expect(liveCards(cards, NOW, 'me').map(c => c.session)).toEqual(['a', 'job'])
})

test('the status line and the text summary name the others and their agents', () => {
  const aesop = card({
    session: 'a',
    name: 'Aesop',
    status: 'working',
    since: NOW - 180_000,
    task: 'SunYard round',
    agents: [{ id: 'x', label: 'Explore', job: 'find tiles', type: 'Explore', status: 'running', activity: 'Grep tile' }],
  })
  const job = card({ session: 'j', name: 'Quinn', isJob: true })
  expect(summary([aesop, job])).toBe('Aesop working · 1 agent | 1 job')
  expect(summary([])).toBeUndefined()
  const text = asText(card({ session: 'me' }), [aesop], NOW)
  expect(text).toContain('**Aesop**: working 3m')
  expect(text).toContain('agent Explore: find tiles (running, Grep tile)')
})
