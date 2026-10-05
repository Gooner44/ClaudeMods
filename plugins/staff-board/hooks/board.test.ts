import { expect, test } from 'claude-code/testing'

import type { BoardCard } from '../types'
import { asText, describe, liveCards, summary, taskOf } from './board'

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

test('the job skips the system-reminder blocks the desktop app puts in front of a prompt', () => {
  const prompt = [
    '<system-reminder>',
    'Codebase and user instructions are shown below.',
    '',
    'Contents of CLAUDE.md:',
    '</system-reminder>',
    '<system-reminder>',
    'The user started this session without choosing a project folder.',
    '</system-reminder>',
    '',
    'Fix the staff board so the job is the prompt, not the reminder.',
    'Then bump the version.',
  ].join('\n')
  expect(taskOf(prompt)).toBe('Fix the staff board so the job is the prompt, not the reminder.')
  expect(taskOf('<task>\nRun the nightly sync\n</task>\n')).toBe('Run the nightly sync')
  expect(taskOf('\nplain prompt\n')).toBe('plain prompt')
  expect(taskOf('<system-reminder>only a reminder</system-reminder>')).toBe('<system-reminder>only a reminder</system-reminder>')
})
