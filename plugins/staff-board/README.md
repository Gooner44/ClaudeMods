# staff-board

See every Claude Code session on your PC at once: which ones are working, what each is doing right now, and the agents they've started. It draws a row of little Clawd characters above the prompt, one per session and one per agent.

## What you see

### The band above the prompt

One tile per character: this session first (marked "(here)"), then your other sessions, each followed by the agents it's running (marked "↳").

| Part of the tile | What it tells you |
|---|---|
| **The character's colour** | The model: purple Fable, orange Opus, blue Sonnet, green Haiku, grey anything else |
| **The glow around it** | The effort: faint at low, brighter and wider through medium, high, xhigh and max; a flickering aura with flames at ultracode |
| **Walking or standing** | Walking while it works; standing (blinking now and then) and dimmed while idle |
| **Name and state** | The session's name, then how long it's been working, or "idle" |
| **The line beneath** | What it's doing right now (the tool it's calling, e.g. "editing board.ts"), or the task it's on. An idle session shows "replied:" and the first line of its last reply when that came after your last message, otherwise "last:" and your last message |
| **A speech bubble by the head** (0.5) | Your move: that session replied after your last message to it. It clears when you write back. It doesn't mean "unread": no session can tell when you look at it. In the terminal band the bubble is a 💬 before the name. This session's own tile never shows one. |

In the desktop app, hover a character for its model, effort and full task. A session's glow appears after its first model request.

The band sits under usage-bar's meters when both are installed. Collapse it with `[-]`, or ctrl+x ctrl+a.

### Who's on the band

To keep it short, the band shows only:
- this session
- sessions named with `CLAUDE_STAFF` (see **Naming sessions**)
- desktop-app sessions you've renamed yourself (the app's own automatic titles don't count)
- any session started from one of those, however deep

Unnamed one-off sessions and background jobs stay off the band. `/staff` still lists them.

### The status line

The sessions on the band at a glance, for example `Aesop working · 1 agent`.

### `/staff`

Posts the whole board as text: every session including jobs, its task, what it's doing now, and each agent. On the phone, Remote Control draws no band, so this is the way to see the board there.

## Naming sessions

A session's name on the board comes from, in order:
1. the `CLAUDE_STAFF` environment variable (marks it a standing session, which comes first on the band)
2. `CLAUDE_TASK`, for scripted jobs
3. the title you gave it in the desktop app's sidebar (a rename shows within about 30 seconds)
4. otherwise `Session` and the first four characters of its id

To start a named terminal session:

```
set CLAUDE_STAFF=Claude && claude
```

That's Windows Command Prompt. In PowerShell: `$env:CLAUDE_STAFF='Claude'; claude`. On macOS or Linux: `CLAUDE_STAFF=Claude claude`.

## How it works

Every session writes a small card to `~/.claude/staff-board/<session id>.json`:
- every 3 seconds while something changes, and every 20 seconds otherwise
- with its name, model, effort, status, the first line of its current task, the tool it's calling, and its running agents

Every session reads the others' cards every 5 seconds. A card not updated for 90 seconds counts as closed. Background (`claude -p`) runs write a card but draw nothing.

Desktop-app sessions also read the app's own record of the session, for its title, effort and the session it was started from. That's how sessions you renamed, and their offspring, get onto the band.

**Privacy:** the cards stay on your PC, in your user folder, and nothing is uploaded. They do hold the first line of each session's current prompt and of its last reply, readable by any program running as you. Old cards are ignored once stale, and you can delete the folder's contents any time.

## Settings

There's no settings screen yet. What you can change:

| What | How |
|---|---|
| A session's name | `CLAUDE_STAFF` or `CLAUDE_TASK` before starting it, or rename it in the desktop app |
| Hide the band for now | `[-]` or ctrl+x ctrl+a |
| Turn the mod off | `claude plugin disable staff-board@claude-mods` |

Fixed in the code, for anyone editing their own copy:
- **Model colours:** `MODELS` in `hooks/sprite.ts`
- **Effort glow:** `GLOW` in `hooks/sprite.ts`
- **Who's on the band:** `roster` in `hooks/board.ts`
- **Timings:** `FLUSH_MS`, `HEARTBEAT_MS`, `READ_MS` in `hooks/register.tsx`, and `STALE_MS` in `hooks/board.ts`
- **Tile widths:** `TILE_MIN`, `TILE_MAX` in `hooks/register.tsx`

## Install

```
/plugin marketplace add Gooner44/ClaudeMods
/plugin install staff-board@claude-mods
```

Then `/reload-plugins`, or start a new session. It needs Claude Code 2.1.286 or newer, because it uses the hooks-module plugin API. Every session you start after that, in the terminal or the desktop app's Code tab, writes its card and draws the board.

## Update and remove

```
claude plugin marketplace update claude-mods
claude plugin update staff-board@claude-mods
```

Then `/reload-plugins` in any open session. To remove it: `claude plugin uninstall staff-board@claude-mods`, then delete `~/.claude/staff-board` if you like.

## Troubleshooting

- **Only my own tile shows:** the other sessions aren't named. Set `CLAUDE_STAFF`, or rename them in the desktop app. `/staff` lists them either way.
- **A closed session still shows:** it disappears 90 seconds after its last update.
- **No band on the phone or in a desktop view of a terminal session:** Remote Control views draw no band. Use `/staff`.
- **No glow:** the glow appears after the session's next model request.

## Known limits

- It sees only sessions on the same PC and the same user account. It can't show someone else's sessions, or yours on another machine.
- Desktop-app titles and the "started from" family tree are read from where the Windows desktop app keeps them. On a Mac, desktop sessions still show, named by `CLAUDE_STAFF` or as `Session …`.
- Characters are pixel art in the terminal and small vector drawings in the desktop app.
