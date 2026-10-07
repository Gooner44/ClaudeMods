import type { SessionMessage } from 'claude-code'

// How much of the latest conversation stays word for word, in characters of visible text (about
// 30k tokens; Claude's hidden thinking rides along on top). Edit to taste.
export const TAIL_CHARS = 90_000
// The older part must hold at least this share of the conversation, or splitting would save too
// little and the whole conversation is summarized as before.
export const MIN_OLDER_SHARE = 0.3

export const TAIL_NOTE =
  'This summary covers only the earlier part of the conversation. The latest part is kept word for word right after it, ' +
  'and the work in progress where these messages end carries on there. Call that work "in progress, continued in the kept messages", ' +
  'not pending or not started, and do not guess at what follows.'

/** A message's size as the model reads it: its text, its tool calls' inputs and the tool results it carries. */
export const size = (m: SessionMessage) =>
  m.text.length +
  m.toolUses.reduce((n, u) => n + JSON.stringify(u.input ?? {}).length, 0) +
  (m.toolResults ?? []).reduce((n, r) => n + r.text.length, 0)

/**
 * Where the kept tail starts: the earliest message from which the rest fits `budget`, moved later
 * until no tool call is split from its result and the tail starts a message the API would (a user
 * message, or the assistant message right after one). Undefined when no split is worth making.
 */
export function cutAt(messages: readonly SessionMessage[], budget = TAIL_CHARS): number | undefined {
  const sizes = messages.map(size)
  const total = sizes.reduce((a, b) => a + b, 0)
  let i = messages.length, used = 0
  while (i > 0 && used + sizes[i - 1] <= budget) used += sizes[--i]
  const split = splitsAPair(messages)
  for (let j = Math.max(i, 1); j < messages.length; j++) {
    if (split[j] || (messages[j].role === 'assistant' && messages[j - 1].role !== 'user')) continue
    // Keep the typed request that started this stretch with it, so the summary doesn't present it as pending.
    while (j > 1 && messages[j - 1].role === 'user' && !messages[j - 1].toolResults?.length && !split[j - 1]) j--
    const older = sizes.slice(0, j).reduce((a, b) => a + b, 0)
    return older >= total * MIN_OLDER_SHARE ? j : undefined
  }
  return undefined
}

/** For each index, whether cutting there would part a tool call from its result. */
function splitsAPair(messages: readonly SessionMessage[]) {
  const callAt = new Map<string, number>()
  messages.forEach((m, i) => m.toolUses.forEach(u => callAt.set(u.tool_use_id, i)))
  const split = messages.map(() => false)
  messages.forEach((m, i) =>
    (m.toolResults ?? []).forEach(r => {
      const from = callAt.get(r.tool_use_id)
      if (from !== undefined) for (let j = from + 1; j <= i; j++) split[j] = true
    }),
  )
  return split
}

// ---- The archive the reopen tool searches -------------------------------------------------

export type Entry = { role: 'user' | 'assistant'; text?: string; calls?: { id: string; tool: string; input: string; output?: string; isError?: true }[] }

/** The summarized messages as archive entries, tool output kept whole. */
export const toEntries = (messages: readonly SessionMessage[]): Entry[] =>
  messages
    .map(m => ({
      role: m.role,
      ...(m.text ? { text: m.text } : {}),
      ...(m.toolUses.length
        ? { calls: m.toolUses.map(u => ({ id: u.tool_use_id, tool: u.tool, input: JSON.stringify(u.input ?? {}), output: u.text, ...(u.isError ? { isError: true as const } : {}) })) }
        : {}),
    }))
    .filter(e => e.text || e.calls)

/** Splits entries into chunks whose JSON stays under `max` characters (a plugin reads at most 4 MiB). */
export function chunk(entries: Entry[], max = 3_000_000): Entry[][] {
  const out: Entry[][] = []
  let cur: Entry[] = [], n = 0
  for (const e of entries) {
    const s = JSON.stringify(e).length
    if (n + s > max && cur.length) { out.push(cur); cur = []; n = 0 }
    // One entry too big on its own keeps its head.
    cur.push(s > max ? clipEntry(e, max) : e); n += Math.min(s, max)
  }
  if (cur.length) out.push(cur)
  return out
}
const clipEntry = (e: Entry, max: number): Entry => ({
  ...e,
  text: e.text && clip(e.text, max / 4),
  calls: e.calls?.map(c => ({ ...c, input: clip(c.input, max / 8), output: c.output && clip(c.output, max / 2 / e.calls!.length) })),
})

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n… [${s.length - n} more characters cut]` : s)

/** The reopen tool's answer: one call's whole output by id, or the latest matches for a query. */
export function reopen(entries: Entry[], query: { query?: string; id?: string }): string {
  if (query.id) {
    const call = entries.flatMap(e => e.calls ?? []).find(c => c.id === query.id)
    return call ? `${call.tool} ${clip(call.input, 2000)}\n\n${clip(call.output ?? '(no output stored)', 60_000)}` : `No archived call has id ${query.id}.`
  }
  const q = (query.query ?? '').trim().toLowerCase()
  if (!q) return 'Give a query (a file path, command, error text or phrase) or an id.'
  const hits: string[] = []
  let room = 30_000
  for (const e of [...entries].reverse()) {
    if (hits.length >= 6 || room <= 0) break
    for (const c of [...(e.calls ?? [])].reverse()) {
      if (!`${c.input}\n${c.output ?? ''}`.toLowerCase().includes(q)) continue
      const piece = `[call ${c.id}] ${c.tool} ${clip(c.input, 600)}${c.isError ? ' (error)' : ''}\n${clip(c.output ?? '(no output stored)', Math.min(8000, room))}`
      hits.push(piece); room -= piece.length
    }
    if (e.text?.toLowerCase().includes(q)) {
      const piece = `[${e.role === 'user' ? 'the user said' : 'Claude said'}]\n${clip(e.text, Math.min(6000, room))}`
      hits.push(piece); room -= piece.length
    }
  }
  return hits.length
    ? `${hits.length} match(es), latest first. For one call's whole output, reopen with its id.\n\n${hits.join('\n\n---\n\n')}`
    : `Nothing in the summarized part of this conversation contains "${query.query}".`
}
