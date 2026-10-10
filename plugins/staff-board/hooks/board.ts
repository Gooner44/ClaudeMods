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

// One word for what an agent is doing (Tarl, 2026-10-10: agents are small figures with a word, not a
// line): the tool's verb while it runs one, else its state.
export function verbOf(tool: string | undefined, status: string): string {
  if (status === 'pending') return 'starting'
  if (status !== 'running') return status
  switch (tool) {
    case undefined:
    case '':
      return 'thinking'
    case 'Bash':
    case 'PowerShell':
      return 'bash'
    case 'Read':
      return 'reading'
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return 'writing'
    case 'Grep':
    case 'Glob':
      return 'searching'
    case 'WebFetch':
    case 'WebSearch':
      return 'browsing'
    case 'Agent':
      return 'delegating'
    case 'Skill':
      return 'skill'
    case 'TodoWrite':
      return 'planning'
    case 'AskUserQuestion':
      return 'asking'
    default: {
      const mcp = tool.match(/^mcp__(.+?)__/)
      return (mcp ? mcp[1]! : tool).toLowerCase().slice(0, 10)
    }
  }
}

// The first line of a prompt, as the task a session is on. Desktop-app sessions put
// <system-reminder>…</system-reminder> blocks in front of what the person typed, and the text
// itself may sit inside a <tag>…</tag> wrapper; the reminders are not the job, so they go whole,
// then any line that is only a tag. The raw text stands in when nothing else is left.
const firstLine = (s: string) => s.split('\n').find(l => l.trim()) ?? ''
export const taskOf = (text: string) => {
  const bare = text
    .replace(/<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder\s*>/g, '')
    .replace(/^[ \t]*<\/?[a-zA-Z][\w-]*\b[^>]*>[ \t]*$/gm, '')
  return clip(firstLine(bare) || firstLine(text), 100)
}

// The first line of a reply worth reading on a tile: past code fences, table rules and blank lines,
// with the markdown marks taken off.
export const replyOf = (answer: string) => {
  let isCode = false
  const line = answer
    .split(/\r?\n/)
    .filter(l => (/^\s*```/.test(l) ? ((isCode = !isCode), false) : !isCode && !/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l)))
    .map(l => l.replace(/^\s*(#+|[-*>]|\d+\.)\s+/, '').replace(/[*_`]+/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim())
    .find(l => /[A-Za-z0-9]/.test(l))
  return line ? clip(line, 100) : undefined
}

// Beneath an idle tile: its last reply while that's newer than the person's last message (Tarl,
// 2026-10-07), otherwise that message.
export const idleLine = (c: Pick<BoardCard, 'task' | 'reply' | 'repliedAt' | 'promptedAt'>) =>
  c.reply && (c.repliedAt ?? 0) > (c.promptedAt ?? 0) ? `replied: ${c.reply}` : c.task ? `last: ${c.task}` : 'no task yet'

// What the plugins beneath drew in the band, or nothing. The engine draws nothing of its own
// there, and its placeholder (type 'engine'), embedded in a tree, makes the desktop app drop
// the whole band; so the innermost mod leaves it out.
export const beneath = <T extends { type: string }>(drawn: T): T | null => (drawn.type === 'engine' ? null : drawn)

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
    for (const a of c.agents) lines.push(`  - agent ${a.label}: ${a.job || a.type} (${a.status}${a.activity ? `, ${a.activity}` : ''})`)
  }
  if (me) card(me, true)
  for (const c of others) card(c, false)
  if (!others.length) lines.push('No other sessions are running.')
  return lines.join('\n')
}

// The sessions the band shows: the standing staff (Claude, Aesop), any desktop session the person
// named, this one, and every session spawned from one of those, however deep. Unnamed one-off
// sessions and background jobs stay off the band (/staff still lists them).
export function roster(others: BoardCard[], me: BoardCard | null): BoardCard[] {
  const kept = others.filter(c => (c.staff && !c.isJob) || c.isNamed)
  const anchors = new Set([me, ...kept].map(c => c?.desktopId).filter(Boolean))
  for (let grew = true; grew; ) {
    grew = false
    for (const c of others) {
      if (kept.includes(c) || !c.spawnedFrom || !anchors.has(c.spawnedFrom)) continue
      kept.push(c)
      if (c.desktopId) anchors.add(c.desktopId)
      grew = true
    }
  }
  const rank = (c: BoardCard) => (c.staff ? 0 : c.isNamed ? 1 : 2)
  return kept.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

// What the desktop app keeps about one of its sessions (claude-code-sessions/…/local_*.json),
// as far as the board needs it; null when the file is someone else's or unreadable.
export type DesktopMeta = { desktopId: string; title?: string; isNamed: boolean; spawnedFrom?: string; effort?: string; focusedAt?: number }
export function desktopMeta(text: string, session: string): DesktopMeta | null {
  try {
    const j = JSON.parse(text) as {
      sessionId?: string
      cliSessionId?: string
      title?: string
      titleSource?: string
      effort?: string
      spawnedFrom?: { sessionId?: string }
      lastFocusedAt?: number
    }
    if (j.cliSessionId !== session || !j.sessionId) return null
    return {
      desktopId: j.sessionId,
      title: j.title || undefined,
      // 'auto' is the app's own guess; a title set by the person or at their word ('tool') counts.
      isNamed: !!j.title && !!j.titleSource && j.titleSource !== 'auto',
      spawnedFrom: j.spawnedFrom?.sessionId,
      effort: j.effort,
      // The app stamps this when the person switches to the session, not while they stay on it.
      focusedAt: typeof j.lastFocusedAt === 'number' ? j.lastFocusedAt : undefined,
    }
  } catch {
    return null
  }
}

// The person's move: the session's reply is the last word, newer than their last message to it
// (Tarl, 2026-10-07). Jobs and working sessions never show it.
export const isYourTurn = (c: BoardCard) => !c.isJob && c.status === 'idle' && !!c.repliedAt && c.repliedAt > (c.promptedAt ?? 0)

// Whether the person has had this desktop session open since it replied (0.6.2, Tarl 2026-10-09: the terminal
// sessions are retired, so switching to the session counts as seeing the reply). The app stamps lastFocusedAt when
// they switch to a session, not while they stay on it, so a session counts as open from its stamp until another
// session's later stamp, or until now when none came after. A terminal session has no stamp and keeps its bubble
// until they write back; a reply read on the phone doesn't count either.
export function sawReply(c: BoardCard, all: BoardCard[]): boolean {
  if (!c.desktopId || !c.focusedAt || !c.repliedAt) return false
  const left = all.filter(o => o.session !== c.session && (o.focusedAt ?? 0) > c.focusedAt!).map(o => o.focusedAt!)
  return c.repliedAt < (left.length ? Math.min(...left) : Infinity)
}

// A turn the person started, not one a background task or an agent's message started.
export const isPrompt = (text: string) => !/^\s*</.test(text.replace(/<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder\s*>/g, ''))

// A bubble that has been up this long fades to half strength.
export const FADE_MS = 10 * 60_000

export type Bubble = { kind: 'permission' | 'question' | 'reply'; isFaded: boolean }

// What the session wants from the person, most urgent first: an OK at a permission prompt, an
// answer to its question, or a reply to its reply.
// `all` is every live card, this session's own included, for the focus stamps (see sawReply).
export function bubbleOf(c: BoardCard, now: number, all: BoardCard[] = []): Bubble | undefined {
  if (c.isJob) return undefined
  const at = (kind: Bubble['kind'], since: number) => ({ kind, isFaded: now - since >= FADE_MS })
  if (c.status === 'working' && c.waitingOn) return at(c.waitingOn, c.waitingSince ?? now)
  return isYourTurn(c) && !sawReply(c, all) ? at('reply', c.repliedAt!) : undefined
}

// A card's content without its heartbeat, to tell whether a re-read changed anything (a bubble
// fading counts).
export const signature = (cards: BoardCard[], now = 0) =>
  JSON.stringify(cards.map(c => ({ ...c, updatedAt: 0, faded: now ? bubbleOf(c, now)?.isFaded : undefined })))
