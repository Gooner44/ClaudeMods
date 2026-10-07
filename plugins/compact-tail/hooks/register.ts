import type { EngineInterface, Next, Register, SessionCompactInput } from 'claude-code'

import { TAIL_NOTE, chunk, cutAt, reopen, toEntries, type Entry } from './split'

const TOOL = 'mcp__compact-tail__reopen'
let dir = ''

// The archive of what compaction summarized: ~/.claude/compact-tail/<session>/<time>-<n>.json.
async function archiveDir($: EngineInterface) {
  if (dir) return dir
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  dir = `${home.replace(/\\/g, '/')}/.claude/compact-tail/${await $.session.id()}`
  return dir
}

async function readArchive($: EngineInterface): Promise<Entry[]> {
  const d = await archiveDir($)
  const files = (await $.fs.list(d).catch(() => [])).filter(f => f.kind === 'file' && f.name.endsWith('.json')).map(f => f.name).sort()
  const out: Entry[] = []
  for (const f of files) out.push(...(JSON.parse(await $.fs.read(`${d}/${f}`)) as Entry[]))
  return out
}

// Automatic compaction: the older part goes through the built-in summary (with compact-brief's
// priorities, when that mod is on), the latest part stays word for word, and everything summarized
// is archived for the reopen tool first. A plugin's compaction, /compact (unless COMPACT_TAIL_MANUAL=1)
// and anything that can't be split cleanly run as before; precompute is skipped so the split happens
// on the real compaction. COMPACT_TAIL_CHARS overrides how much stays word for word.
async function compactAuto($: EngineInterface, e: SessionCompactInput, next: Next<'session.compact'>) {
  const budget = Number(await $.env.get('COMPACT_TAIL_CHARS')) || undefined
  const at = cutAt(e.messages, budget)
  if (at === undefined) return next(e)
  const older = e.messages.slice(0, at), tail = e.messages.slice(at)
  const d = await archiveDir($)
  const stamp = String(await $.clock.now())
  const parts = chunk(toEntries(older))
  for (let i = 0; i < parts.length; i++) await $.fs.write(`${d}/${stamp}-${i}.json`, JSON.stringify(parts[i]))
  const instructions = [e.instructions?.trim(), TAIL_NOTE].filter(Boolean).join('\n\n')
  const done = await next({ ...e, messages: older, instructions })
  if (done.skip !== undefined) return done
  return { messages: [...done.messages, ...tail], tokensBefore: done.tokensBefore, usage: done.usage }
}

// /compact splits too when COMPACT_TAIL_MANUAL=1; otherwise it summarizes everything, as before.
async function compactManual($: EngineInterface, e: SessionCompactInput, next: Next<'session.compact'>) {
  return (await $.env.get('COMPACT_TAIL_MANUAL')) === '1' ? compactAuto($, e, next) : next(e)
}

export const register: Register = on => {
  on('session.compact', { trigger: 'precompute' }, () => ({ skip: 'compact-tail summarizes when the compaction runs' })).catch(($, e, next) => next(e))
  on('session.compact', { trigger: 'auto' }, compactAuto).catch(($, e, next) => next(e))
  on('session.compact', { trigger: 'manual' }, compactManual).catch(($, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.tool.register({
      name: 'reopen',
      description:
        "Brings back, word for word, anything from the part of this conversation that compaction summarized: tool output (file reads, command output, web pages, agent reports) and the exact messages. Use it when the summary mentions something you need in full rather than guessing or redoing the work. Search with `query` (a file path, command, error text or phrase; latest matches first), or pass a call's `id` from an earlier result for that call's whole output.",
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Text to find' }, id: { type: 'string', description: "A call's id from an earlier reopen result" } },
      },
    })
    return result
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const { query, id } = e as unknown as { query?: string; id?: string }
    const entries = await readArchive($).catch(() => [] as Entry[])
    return { result: entries.length ? reopen(entries, { query, id }) : 'Nothing has been summarized in this session yet.' }
  }).catch(() => ({ deny: 'reopen could not read its archive this time.' }))
}
