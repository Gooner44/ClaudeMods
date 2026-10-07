import type { SessionMessage } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { chunk, cutAt, reopen, toEntries } from './split'

const said = (role: 'user' | 'assistant', text: string): SessionMessage => ({ role, text, toolUses: [] })
const call = (id: string, tool: string, input: Record<string, unknown>, output: string): SessionMessage[] => [
  { role: 'assistant', text: '', toolUses: [{ tool_use_id: id, tool, input, text: output }] },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: id, text: output, isError: false }] },
]
const big = (n: number) => 'x'.repeat(n)

// An old stretch of heavy tool work, then a short recent exchange.
const convo: SessionMessage[] = [
  said('user', 'Fix the deploy script.'),
  ...call('a1', 'Read', { file_path: 'deploy.js' }, big(5000)),
  ...call('a2', 'Bash', { command: 'node deploy.js', description: 'Run the deploy' }, `Error: ENOENT gate.php\n${big(5000)}`),
  said('assistant', 'Found it: gate.php is missing.'),
  said('user', 'Ok, put it back and deploy.'),
  ...call('a3', 'Write', { file_path: 'gate.php', content: '<?php' }, 'written'),
  said('assistant', 'Done.'),
]

test('the tail is the latest part that fits, and never parts a call from its result', () => {
  const at = cutAt(convo, 300)!
  expect(at).toBeGreaterThan(0)
  const tail = convo.slice(at)
  const calls = new Set(tail.flatMap(m => m.toolUses.map(u => u.tool_use_id)))
  for (const m of tail) for (const r of m.toolResults ?? []) expect(calls.has(r.tool_use_id)).toBe(true)
  // The recent request and its work stay word for word; the big reads go to the summary.
  expect(tail.some(m => m.text === 'Ok, put it back and deploy.')).toBe(true)
  expect(tail.some(m => m.toolUses.some(u => u.tool_use_id === 'a1'))).toBe(false)
})

test('a tail that starts just after a request keeps the request', () => {
  const turn = [
    ...convo,
    said('user', 'Read both files.'),
    ...call('b1', 'Read', { file_path: 'a' }, big(5000)),
    ...call('b2', 'Read', { file_path: 'b' }, big(200)),
  ]
  // Room for both reads but not the request: the request comes along anyway.
  const tail = turn.slice(cutAt(turn, 5240)!)
  expect(tail[0].text).toBe('Read both files.')
})

test('no split when the older part would be too small to be worth it', () => {
  expect(cutAt(convo, 1_000_000)).toBeUndefined()
  expect(cutAt([said('user', 'hi'), said('assistant', 'hello')], 10)).toBeUndefined()
})

test('reopen finds summarized output word for word, by text and by id', () => {
  const entries = toEntries(convo.slice(0, 6))
  const found = reopen(entries, { query: 'enoent' })
  expect(found).toContain('[call a2] Bash')
  expect(found).toContain('Error: ENOENT gate.php')
  expect(reopen(entries, { id: 'a1' })).toContain(big(5000))
  expect(reopen(entries, { query: 'Fix the deploy' })).toContain('[the user said]')
  expect(reopen(entries, { query: 'nowhere' })).toContain('Nothing in the summarized part')
})

test('archive chunks stay under the size a plugin can read back', () => {
  const entries = toEntries(convo)
  const parts = chunk(entries, 6000)
  expect(parts.length).toBeGreaterThan(1)
  for (const p of parts) expect(JSON.stringify(p).length).toBeLessThan(6000 * 1.5)
  expect(parts.flat().length).toBe(entries.length)
})
