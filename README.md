# ClaudeMods

Mods for Claude Code by Tarl Raney, packaged as a plugin marketplace named `claude-mods`.

| Mod | What it does | Docs |
|---|---|---|
| **usage-bar** | A band above the prompt with your Session, Weekly and Fable 5.1 usage, and when each resets | [plugins/usage-bar/README.md](plugins/usage-bar/README.md) |
| **staff-board** | Every Claude Code session on your PC as a little Clawd above the prompt: coloured by model, glowing by effort, with what it's doing now and the agents it's running | [plugins/staff-board/README.md](plugins/staff-board/README.md) |

Both need Claude Code 2.1.286 or newer: they use the hooks-module plugin API, and older versions won't load them. They work in the terminal and in the desktop app's Code tab.

## Install

In any Claude Code session:

```
/plugin marketplace add Gooner44/ClaudeMods
/plugin install usage-bar@claude-mods
/plugin install staff-board@claude-mods
```

Then `/reload-plugins`, or start a new session. Install either one on its own if you like.

The same from a terminal:

```
claude plugin marketplace add Gooner44/ClaudeMods
claude plugin install usage-bar@claude-mods
claude plugin install staff-board@claude-mods
```

To try one without installing, from a copy of this repo: `claude --plugin-dir path/to/ClaudeMods/plugins/usage-bar`.

## Share them with someone

The repo is public, so sharing is sending someone the install lines above. Before they install:
- **Plugins run code on their PC.** These two only read Claude Code's own data, write cards under `~/.claude/staff-board/`, and call `api.anthropic.com` with the person's own login. Anyone can read the code here first.
- **usage-bar needs a Claude subscription login** (Pro or Max), not an API key.
- **staff-board shows only their own sessions**, on their own PC. Nobody sees anyone else's board.
- **Reset times show in US Central** (see usage-bar's Known limits).

To set up a whole team's project so everyone who opens it is offered the mods, add this to the project's `.claude/settings.json`:

```
{
  "extraKnownMarketplaces": {
    "claude-mods": { "source": { "source": "github", "repo": "Gooner44/ClaudeMods" } }
  },
  "enabledPlugins": {
    "usage-bar@claude-mods": true,
    "staff-board@claude-mods": true
  }
}
```

## Update and remove

```
claude plugin marketplace update claude-mods
claude plugin update usage-bar@claude-mods
claude plugin update staff-board@claude-mods
```

Then `/reload-plugins` in open sessions. Remove with `claude plugin uninstall <name>@claude-mods`, and the marketplace with `claude plugin marketplace remove claude-mods`.

## Develop it with live reload

To change a mod and see it at once, load it straight from a copy of this repo instead of the installed copy. Installed plugins are copies kept under `~/.claude/plugins/cache`, so editing the repo doesn't change them.

First clone the repo. Then add these two lines to the `env` block of `~/.claude/settings.json`. Use forward slashes, and separate the folders with `;` on Windows or `:` elsewhere:

```
"CLAUDE_CODE_PLUGIN_DIRS": "path/to/ClaudeMods/plugins/usage-bar;path/to/ClaudeMods/plugins/staff-board",
"CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"
```

Turn off the installed copies so each mod loads only once: `claude plugin disable usage-bar@claude-mods`, and the same for staff-board. Then start new sessions.

From then on, saving a file reloads the mod in every session, so a half-finished save shows everywhere. If a change doesn't show, run `/reload-plugins --force`; some visual changes need the desktop app restarted.

Tests: `claude plugin test plugins/staff-board`. Check the marketplace: `claude plugin validate .`

## Release a change

People who installed from the marketplace get a change only when the version goes up:
1. Bump `version` in the mod's `.claude-plugin/plugin.json`, and the same number in `.claude-plugin/marketplace.json`.
2. Run `claude plugin validate .`, and the mod's tests.
3. Commit and push to GitHub.
4. Others run the update lines above.
