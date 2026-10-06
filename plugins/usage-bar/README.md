# usage-bar

A band above the Claude Code prompt that shows how much of your plan's usage limits you've used, so you see a limit coming before you hit it.

## What you see

Three meters side by side (stacked one above the other when the window is narrower than 66 columns):

| Meter | What it measures |
|---|---|
| **Session** | The rolling 5-hour window |
| **Weekly** | The 7-day window across all models |
| **Fable 5.1** | The per-model weekly window, when your plan has one; "no reading yet" otherwise |

Each meter shows:
- the percentage used, and a bar
- when the window resets: "resets in 2h 14m", or the day and time (in US Central) when there's room
- an amber "▲ Nearing limit" from 70%, and a red "● At limit" from 90%; the label is there so the state never depends on colour alone

In the desktop app's Code tab the bars are solid blocks. In a terminal they're thin `━━━───` lines.

## Where the numbers come from

- **Every reply:** Claude Code's own rate-limit readings (the 5-hour and 7-day windows) arrive with each response, and the band updates from those.
- **Every 5 minutes**, and whenever a reading moves by a whole point: the mod asks Anthropic's account-usage endpoint, using your own Claude login, for the full set of figures. These are the same ones the desktop app's usage card shows. The per-model window (Fable 5.1) exists only there.

So the meters need a **Claude subscription login** (Pro or Max). With an API key instead, the account figures can't be read and the Fable card says "no subscription login". Numbers appear after the first reply of a session.

Nothing is sent anywhere else: the only network call is to `api.anthropic.com` with your own login.

## Settings

There are no switches yet. These are fixed in the code (`hooks/register.tsx`):

| What | Where in the code | Default |
|---|---|---|
| The three meters and their labels | `slots` | Session, Weekly, Fable 5.1 |
| Warning levels | `level` | amber at 70%, red at 90% |
| Colours | `COLOR`, `TRACK` | blue, amber, red; grey track |
| Time zone for reset times | `central` | US Central (`America/Chicago`) |
| How often account figures refresh | `REFRESH_MS` | 5 minutes |
| Stack the meters below this width | `isStacked` | 66 columns |

To change one, edit your own copy of the mod and load it from there (see **Develop it with live reload** in the main ClaudeMods README).

## Install

```
/plugin marketplace add Gooner44/ClaudeMods
/plugin install usage-bar@claude-mods
```

Then `/reload-plugins`, or start a new session. It needs Claude Code 2.1.286 or newer, because it uses the hooks-module plugin API.

To try it without installing, from a copy of the repo:

```
claude --plugin-dir path/to/ClaudeMods/plugins/usage-bar
```

## Update and remove

```
claude plugin marketplace update claude-mods
claude plugin update usage-bar@claude-mods
```

Then `/reload-plugins` in any open session. To remove it: `claude plugin uninstall usage-bar@claude-mods`.

## Works with staff-board

Both mods draw in the same band above the prompt. usage-bar's meters sit on top and staff-board's characters below. Any other mod that draws there has to do the same: draw what the mods beneath it drew (`next(e)`), then its own part. A mod that doesn't hides the others.

## Troubleshooting

- **No band at all:** check the version (`claude --version`, 2.1.286 or newer) and that the plugin is enabled (`claude plugin list`). A desktop app or phone attached to a terminal session through Remote Control is a remote view and draws no band; a session started in the desktop app's own Code tab does.
- **"no reading yet" on every meter:** no reply has come back yet in this session.
- **"no subscription login" or "usage HTTP 401":** sign in with `/login` using a Claude subscription, not an API key.
- **Changes to the code don't show:** run `/reload-plugins --force`. Some visual changes need the desktop app restarted.

## Known limits

- Reset times are always shown in US Central.
- The third meter is labelled for Fable 5.1 and picks up any per-model window whose name contains "fable".
