# compact-tail

When a long Claude Code session fills up, it compacts: everything so far becomes one summary. That frees the most room, but the work Claude was doing a minute ago becomes a paraphrase too: the file it just read, the error it was looking at, the exact words of your last request. compact-tail summarizes only the **older** part and keeps the **latest part word for word**. Anything summarized can be brought back exactly with a `reopen` tool.

## What it does

On an automatic compaction:

1. **Splits the conversation.** About the last 90,000 characters (roughly 30k tokens) stay exactly as they were. The kept part always starts at one of your messages, never in the middle of a task. Usually that's the message that started the latest work, which can make it up to half again as long. Starting mid-task would break the saved transcript, and a resumed session would lose its summary.
2. **Archives the older part** to `~/.claude/compact-tail/<session>/`, tool output included, in full.
3. **Summarizes the older part** with Claude Code's own compaction. The summary is told the conversation continues word for word after it. With [compact-brief](../compact-brief/README.md) on, the summary also keeps your words first.
4. **Gives Claude a `reopen` tool.** It searches the archive by text (a file path, a command, an error, a phrase you used) and returns the original output word for word. It can also return one call's whole output by its id.

Afterwards the session holds the summary and the kept part. We expect about 40–70k tokens on a real session (not yet measured on one), against about 15k for a plain compaction. The extra room is the work in progress, kept exact.

## Why not just trim old tool output?

We replayed 36 real compactions from our own sessions. Swapping old tool output for one-line stubs left 46–68% of the context, so sessions would compact again after about half the usual stretch, carrying far more context the whole time. Two things nothing can trim are behind that: the fixed system prompt, tools and memory (50–85k tokens), and Claude's earlier hidden thinking. Summarizing the old part and keeping the recent part frees nearly as much as a full summary and loses far less.

## When it does nothing

- **`/compact`** summarizes everything, as before. Set `COMPACT_TAIL_MANUAL=1` to have it split too.
- **Too little to summarize:** when the older part would be under 30% of the conversation, the whole thing is summarized as usual.
- **One long run of tool work:** when no message of yours is recent enough to start the kept part, the whole thing is summarized as usual.
- **Errors:** if anything goes wrong, compaction runs as it would without the mod.
- **Precompute:** Claude Code's background pre-summary is skipped, so the split happens at the real compaction. That can make an automatic compaction take a few seconds longer.

## Settings

- `COMPACT_TAIL_CHARS`: how many characters stay word for word (default 90000).
- `COMPACT_TAIL_MANUAL=1`: `/compact` splits as well.

To change the defaults, edit `TAIL_CHARS`, `TAIL_STRETCH` and `MIN_OLDER_SHARE` in `hooks/split.ts`.

## Privacy

The archive is plain JSON on your own disk: everything the summary replaced, tool output included. Nothing is sent anywhere. Delete `~/.claude/compact-tail/` whenever you like. Sessions then simply can't reopen what was summarized.

## Install

```
/plugin marketplace add Gooner44/ClaudeMods
/plugin install compact-tail@claude-mods
```

Then start a new session. Turn it off with `claude plugin disable compact-tail@claude-mods`.
