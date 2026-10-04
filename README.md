# ClaudeMods

Mods for Claude Code, packaged as a plugin marketplace.

## Install

```
/plugin marketplace add Gooner44/ClaudeMods
/plugin install usage-bar@claude-mods
/plugin install staff-board@claude-mods
```

Or try one without installing:

```
claude --plugin-dir path/to/ClaudeMods/plugins/usage-bar
```

These use Claude Code's hooks-module plugin API (built on 2.1.286); older versions won't load them.

## Plugins

### usage-bar

A band above the prompt showing how much of your plan's limits you've used:

- **Session**: the 5-hour window
- **Weekly**: the 7-day window
- **Fable 5.1**: a per-model weekly window, when your plan reports one (otherwise "no reading yet")

Each shows the percentage, a meter, and when it resets (times in US Central). The meter turns amber from 70% and red from 90%, with a "Nearing limit" / "At limit" label so the state never relies on color alone.

On the desktop app the meters are solid bars; in the terminal they're thin `━━━───` lines. Usage figures need a subscription login and appear after the first reply.

### staff-board

See every Claude Code session running on this PC, such as Claude, Aesop and background jobs: what each is working on, what it's doing right now, and the agents it has running.

- **The band above the prompt:** a little Clawd character for every session and every agent it's running. A character walks while it works and stands (blinking now and then) while idle. Next to each one:
  - its name and state (working for how long, or idle)
  - its job: the session's current task, or the agent's task description
  - the tool it's calling right now
  - the model, or which session an agent belongs to

  This session comes first, then Claude, Aesop and the others, then background jobs. The band sits under usage-bar's meters when both are installed. Collapse it with `[-]` or ctrl+x ctrl+a.
- **Status line:** the other sessions at a glance, e.g. `Aesop working · 1 agent | 2 jobs`.
- **`/staff`:** posts the same board as text. Remote Control on the phone draws no band, so this is the phone's view.

The characters are pixel art in the terminal. The desktop app shows a small block glyph instead.

How it works: each session writes a small card to `~/.claude/staff-board/<session id>.json` every few seconds, and reads everyone else's. A card that hasn't been updated for 90 seconds counts as closed. Sessions are named by the `CLAUDE_STAFF` (or `CLAUDE_TASK`) environment variable; unnamed ones show as `Session <id>`. Background (`-p`) runs write their card but don't read the board.

Old cards stay in the folder (they're ignored once stale); delete the folder's contents any time.
