# Activity

The **Activity** tab (`/activity`) is a read-only, newest-first feed of every consequential action on the server: bot create/edit/archive/delete, trigger changes and firings, run start/finish/error/interrupt, chat sends, every tool call, pause/resume/**Stop all**, watchdog and circuit-breaker events, successful sign-ins (not failed ones), API-key create/revoke, and config backup export/restore.

Each entry shows when it happened, the **actor** — a user email, a bot name, a trigger id, or `system` — the action verb (`bot.create`, `run.finish`, `tool.call`, …), the target it acted on, and a one-line summary.

## Filters

- **Actor kind** — all, users, bots, triggers, or system.
- **Action type** — group by verb prefix (`bot`, `trigger`, `run`, `chat`, `key`, `auth`, `config`, `global`, …).
- **Text search** — matches target name/id and summary text.
- **Date range** — from/to day pickers.

## Guarantees

- Append-only: there is no edit or delete API for entries; deleting a bot or trigger never removes its audit rows, which keep showing the recorded names.
- Summaries are redacted before storage exactly like run transcripts — assigned secret values, provider keys and MCP env values appear only as `[REDACTED:<NAME>]` placeholders ([Secrets](/secrets)).
- Tool calls log one entry each (tool name plus a truncated output line); full transcripts stay in the bot's Logs drill-down.

## Retention

Entries are kept forever by default. Settings → **General** → *Audit log retention* keeps entries for N days (**0** = forever); the purge runs daily and records itself as an audit entry by actor `system`.

The HTTP surface is documented under [API → Audit log](/api#audit-log).
