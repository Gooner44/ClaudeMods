export type UsageWindow = { kind: string; percentUsed: number; resetsAt?: string }
export type AccountStatus = { fetchedAt?: number; error?: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-bar': { windows: UsageWindow[]; account: AccountStatus }
  }
}
