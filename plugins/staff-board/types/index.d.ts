// One agent a session is running: a subagent or a teammate, as $.agent.list() names it,
// plus what its loop last called.
export type BoardAgent = {
  id: string
  label: string
  job: string
  type: string
  status: string
  activity?: string
  // The model and effort its last request ran on ('ultracode' when its turn asked for it).
  model?: string
  effort?: string
}

// One session's card: what it writes to the shared folder and what every board draws.
export type BoardCard = {
  session: string
  name: string
  isJob: boolean
  // Named by CLAUDE_STAFF (Claude, Aesop, a job's staff name).
  staff?: boolean
  // A desktop-app session: its id there (local_…), the session it was spawned from, and whether
  // the person (not the app) gave it its title.
  desktopId?: string
  spawnedFrom?: string
  isNamed?: boolean
  model: string
  effort?: string
  cwd: string
  status: 'working' | 'idle' | 'ended'
  task?: string
  activity?: string
  since?: number
  agents: BoardAgent[]
  startedAt: number
  updatedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'staff-board': { me: BoardCard | null; others: BoardCard[] }
  }
}
