import type { Register } from 'claude-code'

import { brief } from './brief'

// Every compaction (automatic, /compact, a plugin's, or the engine's precompute), the main
// conversation's and a subagent's alike, runs with the priorities in brief.ts. Another mod's own
// compaction (e.g. one that prunes tool calls) runs above this one; whatever falls through to the
// built-in summary gets these instructions. If this hook ever fails, compaction runs as it would without it.
export const register: Register = on => {
  on('session.compact', ($, e, next) => next({ ...e, instructions: brief(e.instructions) })).catch(($, e, next) => next(e))
}
