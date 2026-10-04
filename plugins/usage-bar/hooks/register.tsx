import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AccountStatus, UsageWindow } from '../types'

const windows = atom({ plugin: 'usage-bar', key: 'windows' } as const, [] as UsageWindow[])
const account = atom({ plugin: 'usage-bar', key: 'account' } as const, {} as AccountStatus)

type Level = 'ok' | 'warn' | 'crit'
type Slot = { label: string; w?: UsageWindow }

const level = (pct: number): Level => (pct >= 90 ? 'crit' : pct >= 70 ? 'warn' : 'ok')

// Status steps that read on light and dark; a level never rides on color alone.
const COLOR = { ok: '#3987e5', warn: '#e0a100', crit: '#d03b3b' }
const TRACK = '#6e6e6e'
// Shares of one text row: about 2px above the bar, the bar 40% thinner than a full row.
const BAR_GAP = '12%'
const BAR_HEIGHT = '60%'
const NOTE = { ok: '', warn: 'Nearing limit', crit: 'At limit' }

// The account's plan usage, the figures the desktop app's usage card shows. The
// response headers carry only five_hour and seven_day; the per-model weekly
// window (Fable) exists only here, in `limits[]` as kind weekly_scoped.
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const USAGE_HEADERS = { 'anthropic-beta': 'oauth-2025-04-20', Accept: 'application/json' }
const REFRESH_MS = 5 * 60_000
const MIN_GAP_MS = 60_000

// Session = five_hour, Weekly = seven_day; Fable 5.1 = any per-model window naming fable.
const slots = (all: UsageWindow[]): Slot[] => [
  { label: 'Session', w: all.find(w => w.kind === 'five_hour') },
  { label: 'Weekly', w: all.find(w => w.kind === 'seven_day') },
  { label: 'Fable 5.1', w: all.find(w => /fable/i.test(w.kind)) },
]

const pct = (n: number) => `${Math.round(n)}%`

const countdown = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 48) return `${h}h ${mins % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

const central = (iso: string) => {
  try {
    const s = new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
    return `${s.replace(/ (AM|PM)$/, (_, m) => ` ${m.toLowerCase()}`)} Central`
  } catch {
    return ''
  }
}

type Limit = {
  kind?: string
  percent?: number
  resets_at?: string
  scope?: { model?: { id?: string | null; display_name?: string | null } | null } | null
}
type Bucket = { utilization?: number | null; resets_at?: string | null } | null

// The account response as windows: `limits[]` first (session, weekly_all, and
// one weekly_scoped per model), the older named buckets as a fallback.
const parseAccount = (text: string): UsageWindow[] => {
  const body = JSON.parse(text) as { limits?: Limit[]; five_hour?: Bucket; seven_day?: Bucket }
  const out: UsageWindow[] = []
  const push = (kind: string, p: number | null | undefined, at: string | null | undefined) => {
    if (typeof p !== 'number' || out.some(w => w.kind === kind)) return
    out.push({ kind, percentUsed: p, resetsAt: at ?? undefined })
  }
  for (const l of body.limits ?? []) {
    if (l.kind === 'session') push('five_hour', l.percent, l.resets_at)
    else if (l.kind === 'weekly_all') push('seven_day', l.percent, l.resets_at)
    else if (l.kind === 'weekly_scoped') {
      const name = (l.scope?.model?.display_name ?? l.scope?.model?.id ?? '').toLowerCase()
      if (name) push(`weekly_model:${name}`, l.percent, l.resets_at)
    }
  }
  push('five_hour', body.five_hour?.utilization, body.five_hour?.resets_at)
  push('seven_day', body.seven_day?.utilization, body.seven_day?.resets_at)
  return out
}

// Account windows win; header windows fill any kind the account did not name.
const merge = (fromHeaders: UsageWindow[], fromAccount: UsageWindow[]) => [
  ...fromAccount,
  ...fromHeaders.filter(h => !fromAccount.some(a => a.kind === h.kind)),
]

// The two sources, kept apart so either can be refreshed on its own; the atom
// always holds their merge. A reload starts these over, and refetches at once.
let headerWindows: UsageWindow[] = []
let accountWindows: UsageWindow[] = []
let lastFetch = 0
let inFlight = false

async function publish($: EngineInterface) {
  const all = merge(headerWindows, accountWindows)
  await update($, windows, () => all)
}

async function refreshAccount($: EngineInterface, force = false) {
  const now = await $.clock.now()
  if (inFlight || (!force && now - lastFetch < MIN_GAP_MS)) return
  inFlight = true
  lastFetch = now
  try {
    const auth = await $.session.authorize()
    if (!auth) {
      await update($, account, () => ({ fetchedAt: now, error: 'no subscription login' }))
      return
    }
    const res = await $.http.fetch(USAGE_URL, { headers: USAGE_HEADERS, auth: auth.handle })
    if (!res.ok) {
      await update($, account, () => ({ fetchedAt: now, error: `usage HTTP ${res.status}` }))
      return
    }
    accountWindows = parseAccount(res.text)
    await update($, account, () => ({ fetchedAt: now }))
    await publish($)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await update($, account, () => ({ fetchedAt: now, error: msg.slice(0, 80) }))
  } finally {
    inFlight = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const usage = await $.session.usage()
    headerWindows = usage.rateLimits.map(w => ({ ...w }))
    await publish($)
    void refreshAccount($, true)
    $.clock.every(REFRESH_MS, () => void refreshAccount($, true))
    return result
  })

  on('session.measure', async ($, e, next) => {
    headerWindows = e.rateLimits.map(w => ({ ...w }))
    await publish($)
    // A header window moved a whole point: the account figures likely moved too.
    if (e.changed.includes('rateLimits')) void refreshAccount($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    // Whatever the plugins beneath draw (staff-board's characters) goes under the meters, so
    // several mods share the band.
    const below = await next(e)

    const items = slots(await read($, windows))
    const status = await read($, account)
    const now = await $.clock.now()
    const { Box, Text } = $.ui.resolve(e)

    // Three equal columns, two rows each: label, value and reset on top, the meter beneath.
    const cols = e.props.bodyColumns
    const gap = 3
    const isStacked = cols < 66
    const isBlocks = e.surface !== 'terminal'
    const cardW = isStacked ? cols : Math.floor((cols - gap * 2) / 3)
    const inner = Math.max(8, cardW)

    const card = (s: Slot) => {
      const lv = s.w ? level(s.w.percentUsed) : 'ok'
      const p = s.w ? Math.max(0, Math.min(100, s.w.percentUsed)) : 0
      const filled = s.w ? Math.min(inner, Math.max(p > 0 ? 1 : 0, Math.round((p / 100) * inner))) : 0
      const isAlert = !!s.w && lv !== 'ok'
      const left = s.w?.resetsAt ? countdown(s.w.resetsAt, now) : ''
      const at = s.w?.resetsAt ? central(s.w.resetsAt) : ''
      // A per-model card with no reading says why when the account fetch failed.
      const missing = s.label === 'Fable 5.1' && status.error ? status.error : 'no reading yet'
      const note = !s.w
        ? missing
        : isAlert
          ? `${lv === 'crit' ? '●' : '▲'} ${NOTE[lv]}`
          : left
            ? cardW >= 44 && at ? `resets ${at}` : `resets in ${left}`
            : ''

      return (
        <Box key={s.label} flexDirection="column" flexGrow={1} flexShrink={1} width={cardW} overflow="hidden">
          <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
            <Box flexDirection="row" columnGap={1} flexShrink={0}>
              <Text bold>{s.label}</Text>
              <Text bold color={isAlert ? COLOR[lv] : undefined}>
                {s.w ? pct(s.w.percentUsed) : '—'}
              </Text>
            </Box>
            <Box flexShrink={1} overflow="hidden">
              <Text color={isAlert ? COLOR[lv] : undefined} dimColor={!isAlert} wrap="truncate">
                {note}
              </Text>
            </Box>
          </Box>
          {isBlocks ? (
            // Solid blocks sized by flex share: no glyphs, so nothing wraps or truncates.
            <Box flexDirection="column" height={1}>
              <Box height={BAR_GAP} />
              <Box flexDirection="row" height={BAR_HEIGHT}>
                {p > 0 ? <Box width={0} flexGrow={p} height="100%" backgroundColor={COLOR[lv]} /> : null}
                {p < 100 ? <Box width={0} flexGrow={100 - p} height="100%" backgroundColor={TRACK} /> : null}
              </Box>
            </Box>
          ) : (
            // Terminal cells are exact, so a counted run of glyphs fits the column.
            <Text>
              <Text color={COLOR[lv]}>{'━'.repeat(filled)}</Text>
              <Text dimColor>{'─'.repeat(inner - filled)}</Text>
            </Text>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" width="100%" rowGap={1}>
        <Box flexDirection={isStacked ? 'column' : 'row'} width="100%" columnGap={gap} rowGap={isStacked ? 1 : 0}>
          {items.map(card)}
        </Box>
        {below}
      </Box>
    )
  })
}
