# compact-brief

When a long Claude Code session runs out of room, it compacts: the conversation so far is replaced by a summary. The usual summary keeps what Claude was doing but can lose what *you* said: the decision you made an hour ago, the correction, the reason behind it. compact-brief tells the summarizer what matters most, so that survives.

## What it does

Every compaction (automatic, `/compact`, or one a subagent runs) gets these priorities:

1. **Your own words first:** orders, decisions, corrections, preferences and your reasons, kept close to word for word. If you changed your mind, the latest ruling wins and the summary says it replaced the earlier one.
2. **Then anything with lasting effect:** files written, commits and pushes, deploys, messages sent, settings changed, what was left running, and what failed and why.
3. **Then findings and open questions,** and Claude's own replies, which get far less room than your words.
4. **Last, tool calls and their output,** described in a few words each (what was done, whether it worked, what the file or page holds) instead of copied.

It also asks the summary never to make work look further along than it was: proposed isn't done, tried isn't working.

Nothing else changes. The summary keeps its usual sections, compaction happens at the same times, and nothing extra is sent anywhere or billed. If you type instructions after `/compact`, they come first and these follow.

## Where the ideas come from

The priorities follow the compactor prompt in Victor Taelin's [OptChat spec](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449) (section 4.4), which keeps an endless chat's memory as a tree of summaries. Its lessons carried over: rank the user's words first, describe tool output rather than copy it, state priorities rather than fixed rules, and say "never make anything look further along than it was" instead of using status words the model inflates.

## Settings

None. To change the priorities, edit `PRIORITIES` in `hooks/brief.ts`.

## Works with

A mod that does its own compaction (for example one that prunes old tool calls) runs above this one. Whenever it hands off to the built-in summary, that summary gets these priorities.

## Install

```
/plugin marketplace add Gooner44/ClaudeMods
/plugin install compact-brief@claude-mods
```

Then `/reload-plugins`, or start a new session. Turn it off with `claude plugin disable compact-brief@claude-mods`.
