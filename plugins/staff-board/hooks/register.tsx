import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BoardAgent, BoardCard } from '../types'
import { ago, asText, describe, liveCards, summary, taskOf } from './board'
import { DIM, GLYPH, ORANGE, SPRITE_COLUMNS, SPRITE_ROWS, cells, frameFor } from './sprite'

// Every session on this PC writes its card to ~/.claude/staff-board/<session id>.json and reads
// everyone else's, so Claude sees what Aesop is doing and the reverse; background jobs
// (claude-job.js runs) write theirs too. CLAUDE_STAFF, set by sessions-start.cmd and
// claude-job.js, names the session. The board draws in the band above the prompt: a little
// Clawd per session and per agent, walking while it works, with its job beside its name.
const me = atom({ plugin: 'staff-board', key: 'me' } as const, null as BoardCard | null)
const others = atom({ plugin: 'staff-board', key: 'others' } as const, [] as BoardCard[])

const FLUSH_MS = 3_000
const HEARTBEAT_MS = 20_000
const READ_MS = 5_000
const FRAME_MS = 300
const CARD_W = 48
const LIVE = new Set(['pending', 'running', 'waiting', 'idle'])
const WORKING = new Set(['pending', 'running'])

// A reload starts these over; the next heartbeat writes the card again.
let dir = ''
let file = ''
let card: BoardCard | null = null
let isDirty = false
let lastWrite = 0
const agentActivity: Record<string, string> = {}

// The sprites the band last drew, repainted in place each frame by $.ui.blit.
let bandId = ''
let sprites: { key: string; isWorking: boolean; seed: number }[] = []
let tick = 0

async function flush($: EngineInterface, force = false) {
  if (!card || !file) return
  const now = await $.clock.now()
  if (!force && !isDirty && now - lastWrite < HEARTBEAT_MS) return
  const agents: BoardAgent[] = (await $.agent.list().catch(() => []))
    .filter(a => LIVE.has(a.status))
    .map(a => ({
      id: a.id,
      label: a.name || a.type,
      job: a.description,
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

async function animate($: EngineInterface) {
  if (!bandId || sprites.length === 0) return
  tick += 1
  for (const s of sprites) {
    // Idle sprites only change on a blink tick and the one after it.
    const frame = frameFor(s.isWorking, tick, s.seed)
    if (!s.isWorking && frame === frameFor(false, tick - 1, s.seed)) continue
    const res = await $.ui.blit({ requestId: bandId, key: s.key, cells: cells(frame, s.isWorking ? ORANGE : DIM) }).catch(
      () => ({ deny: 'failed' }),
    )
    if (res.deny) {
      sprites = []
      return
    }
  }
}

const change = (patch: Partial<BoardCard>) => {
  if (!card) return
  card = { ...card, ...patch }
  isDirty = true
}

const seedOf = (id: string) => [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 997, 0)

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
    // A background job only reports; the people-facing sessions read and draw the board too.
    if (e.isInteractive) {
      await $.command.register({ name: 'staff', description: 'List every session on this PC and the agents each is running' })
      void readOthers($)
      $.clock.every(READ_MS, () => void readOthers($))
      $.clock.every(FRAME_MS, () => void animate($))
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

  // The text form, for the phone (Remote Control draws no band).
  on('command.run', { command: 'staff' }, async $ => {
    await flush($, true)
    await readOthers($)
    return { text: asText(await read($, me), await read($, others), await $.clock.now()) }
  })

  // The band: whatever the plugins beneath drew (usage-bar's meters), then the board.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const below = await next(e)
    const self = await read($, me)
    const list = await read($, others)
    const now = await $.clock.now()
    const { Box, Text } = $.ui.resolve(e)
    const isTerminal = e.surface === 'terminal'
    const cols = e.props.bodyColumns
    const cardW = Math.min(CARD_W, cols)
    const textW = Math.max(10, cardW - SPRITE_COLUMNS - 1)
    const drawn: typeof sprites = []

    const sprite = (key: string, isWorking: boolean) => {
      const seed = seedOf(key)
      drawn.push({ key, isWorking, seed })
      const color = isWorking ? ORANGE : DIM
      if (isTerminal) {
        const { Raster } = $.ui.resolve(e as typeof e & { surface: 'terminal' })
        return (
          <Raster key={key} columns={SPRITE_COLUMNS} rows={SPRITE_ROWS} cells={cells(frameFor(isWorking, tick, seed), color)} />
        )
      }
      return (
        <Box width={SPRITE_COLUMNS} flexShrink={0}>
          <Text color={`#${color.toString(16).padStart(6, '0')}`}>{GLYPH}</Text>
        </Box>
      )
    }

    // One character: the sprite, then name and state, the job beside the name, what it's doing.
    const tile = (key: string, opts: {
      name: string
      tag?: string
      isWorking: boolean
      state: string
      job?: string
      now?: string
      foot?: string
    }) => (
      <Box key={key} flexDirection="row" width={cardW} height={SPRITE_ROWS} columnGap={1} flexShrink={0}>
        {sprite(key, opts.isWorking)}
        <Box flexDirection="column" width={textW} overflow="hidden">
          <Box flexDirection="row" columnGap={1}>
            <Text bold color={opts.isWorking ? '#d77757' : undefined} wrap="truncate">{opts.name}</Text>
            {opts.tag ? <Text dimColor wrap="truncate">{opts.tag}</Text> : null}
            <Text dimColor={!opts.isWorking} wrap="truncate">{opts.state}</Text>
          </Box>
          <Text wrap="truncate">{opts.job ?? ''}</Text>
          <Text dimColor wrap="truncate">{opts.now ? `▸ ${opts.now}` : ''}</Text>
          <Text dimColor wrap="truncate">{opts.foot ?? ''}</Text>
        </Box>
      </Box>
    )

    const section = (c: BoardCard, isMe: boolean) => {
      const isWorking = c.status === 'working'
      return (
        <Box key={c.session} flexDirection="row" flexWrap="wrap" width={cols} rowGap={1}>
          {tile(`s-${c.session}`, {
            name: c.name,
            tag: isMe ? '(here)' : c.isJob ? '(job)' : undefined,
            isWorking,
            state: isWorking ? `working ${ago(c.since, now)}` : 'idle',
            job: c.task ? (isWorking ? c.task : `last: ${c.task}`) : 'no task yet',
            now: isWorking ? c.activity : undefined,
            foot: c.model,
          })}
          {c.agents.map(a =>
            tile(`a-${a.id}`, {
              name: a.label,
              isWorking: WORKING.has(a.status),
              state: a.status,
              job: a.job,
              now: a.activity,
              foot: `↳ agent of ${c.name}`,
            }),
          )}
        </Box>
      )
    }

    bandId = e.requestId
    const board = (
      <Box flexDirection="column" width={cols} rowGap={1}>
        {self ? section(self, true) : null}
        {list.map(c => section(c, false))}
      </Box>
    )
    // The drawing above filled `drawn`; keep it for the frame timer.
    sprites = drawn
    return (
      <Box flexDirection="column" width={cols} rowGap={1}>
        {below}
        {board}
      </Box>
    )
  })
}
