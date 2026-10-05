import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BoardAgent, BoardCard } from '../types'
import { ago, asText, beneath, describe, desktopMeta, liveCards, roster, signature, summary, taskOf } from './board'
import { SPRITE_COLUMNS, SPRITE_ROWS, SVG_H, SVG_W, cells, dimmed, frameFor, hex, modelColor, modelName, svgClawd } from './sprite'

// Every session on this PC writes its card to ~/.claude/staff-board/<session id>.json and reads
// everyone else's, so Claude sees what Aesop is doing and the reverse; background jobs
// (claude-job.js runs) write theirs too. CLAUDE_STAFF, set by sessions-start.cmd and
// claude-job.js, names the session; a desktop-app session takes the title the person gave it.
// The band shows the staff, named sessions and what they spawned, one compact tile each: a
// little Clawd in its model's colour, glowing with its effort, its name beside it and its work
// beneath.
const me = atom({ plugin: 'staff-board', key: 'me' } as const, null as BoardCard | null)
const others = atom({ plugin: 'staff-board', key: 'others' } as const, [] as BoardCard[])

const FLUSH_MS = 3_000
const HEARTBEAT_MS = 20_000
const READ_MS = 5_000
const META_MS = 30_000
const META_SCANS = 5
const FRAME_MS = 300
const TILE_GAP = 2
const TILE_MIN = 24
const TILE_MAX = 44
const LIVE = new Set(['pending', 'running', 'waiting', 'idle'])
const WORKING = new Set(['pending', 'running'])

// A reload starts these over; the next heartbeat writes the card again.
let dir = ''
let file = ''
let card: BoardCard | null = null
let staffName = ''
let isDirty = false
let lastWrite = 0
let lastRead = ''
let metaPath = ''
let metaScans = 0
let isUltraTurn = false
const agentActivity: Record<string, string> = {}
const agentModel: Record<string, { model?: string; effort?: string }> = {}

// The terminal sprites the band last drew, repainted in place each frame by $.ui.blit.
let bandId = ''
let sprites: { key: string; isWorking: boolean; seed: number; color: number }[] = []
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
      ...agentModel[a.id],
    }))
  // A job is a session nothing draws on (a claude -p run); the desktop app and the phone attach
  // surfaces, so their sessions count as people-facing even when the SDK started them, and a
  // session the desktop app keeps is never a job, attached or not.
  const isJob = (await $.session.surfaces()).length === 0 && !card.desktopId
  card = { ...card, agents, isJob, updatedAt: now }
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
  // Redraw only on a real change: each redraw restarts the SVG characters' animation.
  const sig = signature(list)
  if (sig === lastRead) return
  lastRead = sig
  await update($, others, () => list)
  $.ui.status(summary(roster(list, card)))
}

const dirs = async ($: EngineInterface, path: string) =>
  (await $.fs.list(path).catch(() => [])).filter(f => f.kind === 'dir').map(f => `${path}/${f.name}`)

// Where the desktop app keeps this session's record (claude-code-sessions/<account>/<org>/local_*.json),
// under the MSIX package's folder or the plain install's; '' when it keeps none (a terminal session).
async function findMeta($: EngineInterface, session: string): Promise<string> {
  const slash = (p: string | undefined) => (p ?? '').replace(/\\/g, '/')
  const local = slash(await $.env.get('LOCALAPPDATA'))
  const roaming = slash(await $.env.get('APPDATA'))
  const roots: string[] = []
  if (local) {
    for (const pkg of await dirs($, `${local}/Packages`)) {
      if (/\/Claude_[^/]*$/.test(pkg)) roots.push(`${pkg}/LocalCache/Roaming/Claude/claude-code-sessions`)
    }
  }
  if (roaming) roots.push(`${roaming}/Claude/claude-code-sessions`)
  for (const root of roots) {
    for (const account of await dirs($, root)) {
      for (const org of await dirs($, account)) {
        for (const f of await $.fs.list(org).catch(() => [])) {
          if (f.kind !== 'file' || !/^local_.*\.json$/.test(f.name)) continue
          const path = `${org}/${f.name}`
          if (desktopMeta(await $.fs.read(path).catch(() => ''), session)) return path
        }
      }
    }
  }
  return ''
}

// The desktop app's title, parent and effort for this session, kept current (a rename shows).
async function readMeta($: EngineInterface) {
  if (!card) return
  if (!metaPath) {
    if (metaScans >= META_SCANS) return
    metaScans += 1
    metaPath = await findMeta($, card.session)
    if (!metaPath) return
  }
  const meta = desktopMeta(await $.fs.read(metaPath).catch(() => ''), card.session)
  if (!meta) {
    metaPath = ''
    return
  }
  const patch: Partial<BoardCard> = {
    desktopId: meta.desktopId,
    spawnedFrom: meta.spawnedFrom,
    isNamed: meta.isNamed,
    name: staffName || meta.title || card.name,
    effort: card.effort ?? meta.effort,
  }
  if (Object.entries(patch).some(([k, v]) => card![k as keyof BoardCard] !== v)) change(patch)
}

async function animate($: EngineInterface) {
  if (!bandId || sprites.length === 0) return
  tick += 1
  for (const s of sprites) {
    // Idle sprites only change on a blink tick and the one after it.
    const frame = frameFor(s.isWorking, tick, s.seed)
    if (!s.isWorking && frame === frameFor(false, tick - 1, s.seed)) continue
    const res = await $.ui.blit({ requestId: bandId, key: s.key, cells: cells(frame, s.color) }).catch(() => ({ deny: 'failed' }))
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

// Ultracode is a word in the prompt (or the reminder that says it is on), not an effort level.
const REMINDERS = /<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder\s*>/g
const isUltra = (text: string) =>
  /\bultracode\b/i.test(text.replace(REMINDERS, '')) || /\bultracode is on\b/i.test(text)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
    staffName = (await $.env.get('CLAUDE_STAFF')) ?? ''
    const task = await $.env.get('CLAUDE_TASK')
    const session = await $.session.id()
    const now = await $.clock.now()
    dir = `${home.replace(/\\/g, '/')}/.claude/staff-board`
    file = `${dir}/${session}.json`
    card = {
      session,
      name: staffName || task || `Session ${session.slice(0, 4)}`,
      isJob: e.surface === null,
      staff: !!staffName,
      model: await $.session.model(),
      cwd: e.cwd,
      status: 'idle',
      agents: [],
      startedAt: now,
      updatedAt: now,
    }
    await readMeta($)
    await flush($, true)

    $.clock.every(FLUSH_MS, () => void flush($))
    $.clock.every(META_MS, () => void readMeta($))
    // Every session reads and draws the board: one started by the desktop app or the SDK is not
    // interactive yet still has a person watching. A -p job reads a folder every 5 s and draws nothing.
    await $.command.register({ name: 'staff', description: 'List every session on this PC and the agents each is running' })
    void readOthers($)
    $.clock.every(READ_MS, () => void readOthers($))
    $.clock.every(FRAME_MS, () => void animate($))
    return result
  })

  on('turn.start', async ($, e, next) => {
    isUltraTurn = isUltra(e.text)
    change({ status: 'working', task: taskOf(e.text), activity: 'thinking', since: await $.clock.now() })
    return next(e)
  })

  // Each model request names the model and effort it runs on, the main loop's and each agent's.
  on('turn.step', async function* ($, e, next) {
    const effort = typeof e.effort === 'string' ? e.effort : undefined
    if (e.agentId) {
      const was = agentModel[e.agentId]
      if (was?.model !== e.model || was?.effort !== effort) {
        agentModel[e.agentId] = { model: e.model, effort }
        isDirty = true
      }
    } else {
      const shown = isUltraTurn ? 'ultracode' : effort
      if (card && (card.model !== e.model || card.effort !== shown)) change({ model: e.model, effort: shown })
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      delete agentActivity[e.agentId]
      delete agentModel[e.agentId]
    } else change({ status: 'idle', activity: undefined, since: undefined })
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

  // The text form, for the phone (Remote Control draws no band). It lists every session.
  on('command.run', { command: 'staff' }, async $ => {
    await flush($, true)
    await readOthers($)
    return { text: asText(await read($, me), await read($, others), await $.clock.now()) }
  })

  // The band: whatever the plugins beneath drew, then a row of tiles, one per character.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const result = await next(e)
    const below = beneath(result)
    const self = await read($, me)
    const shown = [...(self ? [self] : []), ...roster(await read($, others), self)]
    const now = await $.clock.now()
    const { Box, Text } = $.ui.resolve(e)
    const cols = e.props.bodyColumns

    type Tile = {
      key: string
      name: string
      model?: string
      effort?: string
      isWorking: boolean
      state: string
      work: string
      about: string
    }
    const tiles: Tile[] = shown.flatMap(c => {
      const isWorking = c.status === 'working'
      const head: Tile = {
        key: `s-${c.session}`,
        name: c === self ? `${c.name} (here)` : c.name,
        model: c.model,
        effort: c.effort,
        isWorking,
        state: isWorking ? ago(c.since, now) || 'working' : 'idle',
        work: isWorking ? (c.activity && c.activity !== 'thinking' ? c.activity : c.task ?? 'thinking') : c.task ? `last: ${c.task}` : 'no task yet',
        about: c.task ?? '',
      }
      return [
        head,
        ...c.agents.map(a => ({
          key: `a-${a.id}`,
          name: `↳ ${a.label}`,
          model: a.model ?? c.model,
          effort: a.effort,
          isWorking: WORKING.has(a.status),
          state: a.status === 'running' ? '' : a.status,
          work: a.activity ?? a.job,
          about: `${a.job} (agent of ${c.name})`,
        })),
      ]
    })
    if (tiles.length === 0) return result

    const perRow = Math.max(1, Math.floor((cols + TILE_GAP) / (TILE_MIN + TILE_GAP)))
    const across = Math.min(tiles.length, perRow)
    const tileW = Math.max(TILE_MIN, Math.min(TILE_MAX, Math.floor((cols + TILE_GAP) / across) - TILE_GAP))
    const drawn: typeof sprites = []

    const sprite = (t: Tile) => {
      const seed = seedOf(t.key)
      if (e.surface === 'terminal') {
        const { Raster } = $.ui.resolve(e as typeof e & { surface: 'terminal' })
        const color = t.isWorking ? modelColor(t.model) : dimmed(modelColor(t.model))
        drawn.push({ key: t.key, isWorking: t.isWorking, seed, color })
        return <Raster key={t.key} columns={SPRITE_COLUMNS} rows={SPRITE_ROWS} cells={cells(frameFor(t.isWorking, tick, seed), color)} />
      }
      const { Svg } = $.ui.resolve(e as typeof e & { surface: 'desktop' })
      const label = `${t.name} · ${modelName(t.model)} · ${t.effort ?? 'effort unknown'}${t.about ? `\n${t.about}` : ''}`
      return (
        <Svg
          source={svgClawd({ model: t.model, effort: t.effort, isWorking: t.isWorking, seed, title: label })}
          alt={label}
          width={SVG_W}
          height={SVG_H}
          isInteractive
        />
      )
    }

    const nameRow = (t: Tile) => {
      const color = hex(t.isWorking ? modelColor(t.model) : dimmed(modelColor(t.model)))
      return (
        <Box flexDirection="row" columnGap={1} overflow="hidden">
          <Text bold color={color} wrap="truncate">{t.name}</Text>
          {t.state ? <Text dimColor wrap="truncate">{t.state}</Text> : null}
        </Box>
      )
    }

    // Terminal: the 2-row character beside its name and work. Elsewhere: character and name on
    // top, the work beneath.
    const tile = (t: Tile) =>
      e.surface === 'terminal' ? (
        <Box key={t.key} flexDirection="row" width={tileW} height={SPRITE_ROWS} columnGap={1} flexShrink={0}>
          {sprite(t)}
          <Box flexDirection="column" width={tileW - SPRITE_COLUMNS - 1} overflow="hidden">
            {nameRow(t)}
            <Text dimColor={!t.isWorking} wrap="truncate">{t.work}</Text>
          </Box>
        </Box>
      ) : (
        <Box key={t.key} flexDirection="column" width={tileW} flexShrink={0} overflow="hidden">
          <Box flexDirection="row" columnGap={1} alignItems="center">
            {sprite(t)}
            {nameRow(t)}
          </Box>
          <Text dimColor={!t.isWorking} wrap="truncate">{t.work}</Text>
        </Box>
      )

    bandId = e.requestId
    const board = (
      <Box flexDirection="row" flexWrap="wrap" width={cols} columnGap={TILE_GAP} rowGap={1}>
        {tiles.map(tile)}
      </Box>
    )
    // The drawing above filled `drawn` (terminal only); keep it for the frame timer.
    sprites = drawn
    return (
      <Box flexDirection="column" width={cols} rowGap={1}>
        {below}
        {board}
      </Box>
    )
  })
}
