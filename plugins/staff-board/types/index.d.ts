// One agent a session is running: a subagent or a teammate, as $.agent.list() names it,
// plus what its loop last called.
export type BoardAgent = {
  id: string
  label: string
  type: string
  status: string
  activity?: string
}

// One session's card: what it writes to the shared folder and what every board draws.
export type BoardCard = {
  session: string
  name: string
  isJob: boolean
  model: string
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
