import { expect, test } from 'claude-code/testing'

import type { BoardCard } from '../types'
import { FADE_MS, asText, sawReply, beneath, bubbleOf, describe, desktopMeta, idleLine, isPrompt, isYourTurn, liveCards, replyOf, roster, summary, taskOf, verbOf } from './board'

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

test('an agent gets one word: its tool while it runs one, else its state', () => {
  expect(verbOf('Bash', 'running')).toBe('bash')
  expect(verbOf('Edit', 'running')).toBe('writing')
  expect(verbOf('Grep', 'running')).toBe('searching')
  expect(verbOf('mcp__memmachine__search_memory', 'running')).toBe('memmachine')
  expect(verbOf(undefined, 'running')).toBe('thinking')
  expect(verbOf('Bash', 'pending')).toBe('starting')
  expect(verbOf('Bash', 'waiting')).toBe('waiting')
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

test('the band keeps what another mod drew beneath and drops the engine placeholder', () => {
  const tree = { type: 'Box', children: [] }
  expect(beneath(tree)).toBe(tree)
  expect(beneath({ type: 'engine', ref: 1 })).toBeNull()
})

test('the band keeps staff, named sessions and what they spawned, and drops the rest', () => {
  const me = card({ session: 'm', name: 'Claude_Control', desktopId: 'local_m', isNamed: true })
  const list = [
    card({ session: 'a', name: 'Aesop', staff: true }),
    card({ session: 'j', name: 'Claude', staff: true, isJob: true }),
    card({ session: 'r', name: 'Random question', desktopId: 'local_r' }),
    card({ session: 'k', name: 'Fix the band', desktopId: 'local_k', spawnedFrom: 'local_m' }),
    card({ session: 'g', name: 'Grandchild', spawnedFrom: 'local_k' }),
    card({ session: 'x', name: 'Spawned by random', spawnedFrom: 'local_r' }),
  ]
  expect(roster(list, me).map(c => c.name)).toEqual(['Aesop', 'Fix the band', 'Grandchild'])
})

test('desktop metadata counts a title as named only when the app did not choose it', () => {
  const meta = (o: object) => JSON.stringify({ sessionId: 'local_1', cliSessionId: 's', ...o })
  expect(desktopMeta(meta({ title: 'Claude_Control', titleSource: 'tool' }), 's')?.isNamed).toBe(true)
  expect(desktopMeta(meta({ title: 'Reload plugins', titleSource: 'auto' }), 's')?.isNamed).toBe(false)
  expect(desktopMeta(meta({ spawnedFrom: { sessionId: 'local_0' } }), 's')?.spawnedFrom).toBe('local_0')
  expect(desktopMeta(meta({}), 'other')).toBe(null)
})

test('the bubble shows while the session had the last word, terminal or desktop', () => {
  expect(isYourTurn(card({ repliedAt: NOW, promptedAt: NOW - 5_000 }))).toBe(true)
  expect(isYourTurn(card({ repliedAt: NOW - 5_000, promptedAt: NOW }))).toBe(false)
  expect(isYourTurn(card({ repliedAt: NOW, status: 'working' }))).toBe(false)
  expect(isYourTurn(card({ repliedAt: NOW, isJob: true }))).toBe(false)
  expect(isYourTurn(card({}))).toBe(false)
  expect(isPrompt('<system-reminder>x</system-reminder>\nfix the band')).toBe(true)
})

test('an idle tile shows the reply while it is newer than the last message, else the message', () => {
  expect(replyOf('```js\nx()\n```\n\n**Done.** The band is **live**.')).toBe('Done. The band is live.')
  expect(replyOf('| a | b |\n|---|---|\n| 1 | 2 |')).toBe('| a | b |')
  expect(replyOf('- See [the page](https://x.test) now')).toBe('See the page now')
  expect(replyOf('\n\n')).toBeUndefined()
  expect(idleLine(card({ task: 'fix it', reply: 'Fixed.', promptedAt: NOW - 5_000, repliedAt: NOW }))).toBe('replied: Fixed.')
  expect(idleLine(card({ task: 'and now?', reply: 'Fixed.', promptedAt: NOW, repliedAt: NOW - 5_000 }))).toBe('last: and now?')
  expect(idleLine(card({ task: 'fix it' }))).toBe('last: fix it')
  expect(idleLine(card({}))).toBe('no task yet')
  expect(isPrompt('<task-notification><task-id>b1</task-id></task-notification>')).toBe(false)
})

test('a bubble asks for the most urgent thing and fades after ten minutes', () => {
  const asking = card({ status: 'working', waitingOn: 'permission', waitingTool: 'Bash', waitingSince: NOW - 1_000, repliedAt: NOW - 9_000 })
  expect(bubbleOf(asking, NOW)).toEqual({ kind: 'permission', isFaded: false })
  expect(bubbleOf({ ...asking, waitingOn: 'question' }, NOW)?.kind).toBe('question')
  expect(bubbleOf(asking, NOW - 1_000 + FADE_MS)).toEqual({ kind: 'permission', isFaded: true })
  // Once the turn ends the wait is over; a reply then shows the reply's bubble.
  expect(bubbleOf(card({ waitingOn: 'permission', repliedAt: NOW - 5_000, promptedAt: NOW - 9_000 }), NOW)).toEqual({ kind: 'reply', isFaded: false })
  expect(bubbleOf(card({ repliedAt: NOW - FADE_MS - 1, promptedAt: NOW - FADE_MS - 9_000 }), NOW)?.isFaded).toBe(true)
  expect(bubbleOf(card({ status: 'working' }), NOW)).toBeUndefined()
  expect(bubbleOf({ ...asking, isJob: true }, NOW)).toBeUndefined()
})

test('switching to a desktop session clears its reply bubble (0.6.2)', () => {
  const replied = card({ session: 'a', desktopId: 'local_a', repliedAt: NOW, promptedAt: NOW - 5_000 })
  // Switched to it after the reply: seen.
  expect(sawReply({ ...replied, focusedAt: NOW + 1_000 }, [])).toBe(true)
  // On it when the reply came, and still on it: seen.
  expect(sawReply({ ...replied, focusedAt: NOW - 9_000 }, [])).toBe(true)
  // On it, then switched to another session before the reply: not seen.
  const other = card({ session: 'b', desktopId: 'local_b', focusedAt: NOW - 2_000 })
  expect(sawReply({ ...replied, focusedAt: NOW - 9_000 }, [other])).toBe(false)
  // ...and switching to the other one after the reply doesn't undo having seen it.
  expect(sawReply({ ...replied, focusedAt: NOW - 9_000 }, [{ ...other, focusedAt: NOW + 3_000 }])).toBe(true)
  // A terminal session (no desktop record) keeps its bubble until the person writes back.
  expect(sawReply({ ...replied, desktopId: undefined, focusedAt: NOW + 1_000 }, [])).toBe(false)
  expect(bubbleOf({ ...replied, focusedAt: NOW + 1_000 }, NOW, [])).toBeUndefined()
  expect(bubbleOf({ ...replied, focusedAt: NOW - 9_000 }, NOW, [other])?.kind).toBe('reply')
  // A permission prompt or a question still needs an answer, open or not.
  expect(bubbleOf({ ...replied, status: 'working', waitingOn: 'question', waitingSince: NOW, focusedAt: NOW + 1_000 }, NOW, [])?.kind).toBe('question')
})
