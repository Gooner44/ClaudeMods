# ClaudeMods

Mods for Claude Code, packaged as a plugin marketplace.

## Install

```
/plugin marketplace add Gooner44/ClaudeMods
/plugin install usage-bar@claude-mods
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
