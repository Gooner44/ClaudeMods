import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BoardAgent, BoardCard } from '../types'
import { ago, asText, describe, liveCards, summary, taskOf } from './board'

// Every session on this PC writes its card to ~/.claude/staff-board/<session id>.json and reads
// everyone else's, so Claude sees what Aesop is doing and the reverse; background jobs
// (claude-job.js runs) write theirs too. CLAUDE_STAFF, set by sessions-start.cmd and
// claude-job.js, names the session.
const me = atom({ plugin: 'staff-board', key: 'me' } as const, null as BoardCard | null)
const others = atom({ plugin: 'staff-board', key: 'others' } as const, [] as BoardCard[])

const PANE = 'staff-board'
const FLUSH_MS = 3_000
const HEARTBEAT_MS = 20_000
const READ_MS = 5_000
const LIVE = new Set(['pending', 'running', 'waiting', 'idle'])

// A reload starts these over; the next heartbeat writes the card again.
let dir = ''
let file = ''
let card: BoardCard | null = null
let isDirty = false
let lastWrite = 0
const agentActivity: Record<string, string> = {}

async function flush($: EngineInterface, force = false) {
  if (!card || !file) return
  const now = await $.clock.now()
  if (!force && !isDirty && now - lastWrite < HEARTBEAT_MS) return
  const agents: BoardAgent[] = (await $.agent.list().catch(() => []))
    .filter(a => LIVE.has(a.status))
    .map(a => ({
      id: a.id,
      label: a.name || a.description || a.type,
      type: a.type,
      status: a.status,
      activity: agentActivity[a.id],
    }))
  card = { ...card, agents, updatedAt: now }
  isDirty = false
  lastWrite = now
  await update($, me, () => card)
  await $.fs.write(file, JSON.stringify(card)).catch(() => undefined)
}

async function readOthers($: EngineInterface) {
  if (!dir) return
  const now = await $.clock.now()
  const entries = await $.fs.list(dir).catch(() => [])
  const fresh = entries.filter(f => f.kind === 'file' && f.name.endsWith('.json') && now - f.mtimeMs < 120_000)
  const cards: BoardCard[] = []
  for (const f of fresh) {
    try {
      cards.push(JSON.parse(await $.fs.read(`${dir}/${f.name}`)) as BoardCard)
    } catch {
      // A card mid-write or gone: skip it this round.
    }
  }
  const list = liveCards(cards, now, card?.session)
  await update($, others, () => list)
  $.ui.status(summary(list))
}

const change = (patch: Partial<BoardCard>) => {
  if (!card) return
  card = { ...card, ...patch }
  isDirty = true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
    const staff = await $.env.get('CLAUDE_STAFF')
    const task = await $.env.get('CLAUDE_TASK')
    const session = await $.session.id()
    const now = await $.clock.now()
    dir = `${home.replace(/\\/g, '/')}/.claude/staff-board`
    file = `${dir}/${session}.json`
    card = {
      session,
      name: staff || task || `Session ${session.slice(0, 4)}`,
      isJob: !e.isInteractive,
      model: await $.session.model(),
      cwd: e.cwd,
      status: 'idle',
      agents: [],
      startedAt: now,
      updatedAt: now,
    }
    await flush($, true)

    $.clock.every(FLUSH_MS, () => void flush($))
    // A background job only reports; the people-facing sessions read the board too.
    if (e.isInteractive) {
      await $.command.register({ name: 'staff', description: 'Show every session on this PC and the agents each is running' })
      void readOthers($)
      $.clock.every(READ_MS, () => void readOthers($))
    }
    return result
  })

  on('turn.start', async ($, e, next) => {
    change({ status: 'working', task: taskOf(e.text), activity: 'thinking', since: await $.clock.now() })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) delete agentActivity[e.agentId]
    else change({ status: 'idle', activity: undefined, since: undefined })
    isDirty = true
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const what = describe(String(e.tool), e as unknown as Record<string, unknown>)
    if (e.agentId) {
      agentActivity[e.agentId] = what
      isDirty = true
    } else change({ activity: what })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    change({ status: 'ended' })
    await flush($, true)
    return next(e)
  })

  on('command.run', { command: 'staff' }, async $ => {
    await flush($, true)
    await readOthers($)
    await $.ui.open({ id: PANE, title: 'Staff board' })
    return { text: asText(await read($, me), await read($, others), await $.clock.now()) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const self = await read($, me)
    const list = await read($, others)
    const now = await $.clock.now()
    const width = Math.max(20, e.props.bodyColumns)

    const cardView = (c: BoardCard, isMe: boolean) => {
      const isWorking = c.status === 'working'
      return (
        <Box key={c.session} flexDirection="column" width={width} marginBottom={1}>
          <Box flexDirection="row" columnGap={1}>
            <Text bold color={isWorking ? '#2e9e5b' : undefined}>{isWorking ? '●' : '○'}</Text>
            <Text bold>{c.name}</Text>
            {isMe ? <Text dimColor>(this session)</Text> : null}
            {c.isJob ? <Text dimColor>(job)</Text> : null}
            <Text dimColor={!isWorking}>
              {c.status}
              {isWorking && c.since ? ` ${ago(c.since, now)}` : ''}
            </Text>
            <Text dimColor wrap="truncate">{c.model}</Text>
          </Box>
          {c.task ? <Text dimColor wrap="truncate">{`  on: ${c.task}`}</Text> : null}
          {isWorking && c.activity ? <Text wrap="truncate">{`  now: ${c.activity}`}</Text> : null}
          {c.agents.map(a => (
            <Text key={a.id} wrap="truncate">
              {`  ↳ ${a.label} · ${a.type} · ${a.status}${a.activity ? ` · ${a.activity}` : ''}`}
            </Text>
          ))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" width={width}>
        {self ? cardView(self, true) : null}
        {list.map(c => cardView(c, false))}
        {list.length === 0 ? <Text dimColor>No other sessions are running.</Text> : null}
      </Box>
    )
  })
}
