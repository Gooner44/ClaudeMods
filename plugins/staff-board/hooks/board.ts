import type { BoardCard } from '../types'

// A card older than this is a session that closed without saying so (a crash, a reboot).
export const STALE_MS = 90_000

const clip = (s: string, n: number) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n - 1)}…` : one
}

const base = (p: unknown) => (typeof p === 'string' ? p.split(/[\\/]/).filter(Boolean).pop() ?? p : '')

// What a tool call is doing, in a few words: "Edit register.tsx", "Bash: git push".
export function describe(tool: string, input: Record<string, unknown>): string {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (tool) {
    case 'Bash':
    case 'PowerShell':
      return `${tool}: ${clip(str('description') || str('command'), 60)}`
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return `${tool} ${base(str('file_path') || str('notebook_path'))}`
    case 'Grep':
    case 'Glob':
      return `${tool} ${clip(str('pattern'), 40)}`
    case 'Agent':
      return `starting agent: ${clip(str('description'), 50)}`
    case 'WebFetch':
      return `WebFetch ${clip(str('url').replace(/^https?:\/\//, ''), 50)}`
    case 'WebSearch':
      return `WebSearch ${clip(str('query'), 50)}`
    case 'Skill':
      return `skill ${str('skill')}`
    default: {
      const mcp = tool.match(/^mcp__(.+?)__(.+)$/)
      return mcp ? `${mcp[1]}: ${mcp[2]}` : tool
    }
  }
}

// The first line of a prompt, as the task a session is on.
export const taskOf = (text: string) => clip(text.split('\n').find(l => l.trim()) ?? '', 100)

// Cards read from the folder, newest kept per session, live ones only; standing sessions
// (Claude, Aesop) first by name, then background jobs, newest first.
export function liveCards(cards: BoardCard[], now: number, own?: string): BoardCard[] {
  return cards
    .filter(c => c && c.session !== own && c.status !== 'ended' && now - c.updatedAt < STALE_MS)
    .sort((a, b) =>
      a.isJob !== b.isJob ? (a.isJob ? 1 : -1) : a.isJob ? b.startedAt - a.startedAt : a.name.localeCompare(b.name),
    )
}

export const ago = (from: number | undefined, now: number) => {
  if (!from) return ''
  const m = Math.floor((now - from) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

// The status line: the others at a glance, "Aesop working · 1 agent | 2 jobs".
export function summary(others: BoardCard[]): string | undefined {
  const standing = others.filter(c => !c.isJob)
  const jobs = others.filter(c => c.isJob)
  const parts = standing.map(c => {
    const n = c.agents.length
    return `${c.name} ${c.status}${n ? ` · ${n} agent${n > 1 ? 's' : ''}` : ''}`
  })
  if (jobs.length) parts.push(`${jobs.length} job${jobs.length > 1 ? 's' : ''}`)
  return parts.length ? parts.join(' | ') : undefined
}

// The board as plain text, for the /staff command's row (what the phone shows).
export function asText(me: BoardCard | null, others: BoardCard[], now: number): string {
  const lines: string[] = []
  const card = (c: BoardCard, isMe: boolean) => {
    const head = `${c.status === 'working' ? '●' : '○'} **${c.name}**${isMe ? ' (this session)' : ''}${c.isJob ? ' (job)' : ''}: ${c.status}${c.status === 'working' && c.since ? ` ${ago(c.since, now)}` : ''}`
    lines.push(head)
    if (c.task) lines.push(`  - on: ${c.task}`)
    if (c.status === 'working' && c.activity) lines.push(`  - now: ${c.activity}`)
    for (const a of c.agents) lines.push(`  - agent ${a.label} (${a.type}): ${a.status}${a.activity ? `, ${a.activity}` : ''}`)
  }
  if (me) card(me, true)
  for (const c of others) card(c, false)
  if (!others.length) lines.push('No other sessions are running.')
  return lines.join('\n')
}
