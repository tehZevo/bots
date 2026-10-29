# Triggers & scheduling

Triggers inject messages into a bot's loop: the configured text, on a schedule, when someone calls a webhook URL, or a fixed interval after each run finishes.

Triggers can carry an optional short name. The Triggers tab lists each trigger with its name — or the raw schedule / `webhook <id>` label when unnamed — plus its type and `(paused)` while disabled. Name the ones you operate by hand; leave throwaways anonymous.

## Schedule triggers

Schedule triggers store a relative interval (`@every 30m`) or standard cron expression. The editor offers **Every**, **Daily**, **Weekdays**, **Weekly**, **Monthly**, and **Custom**. A plain-English sentence above the controls states what will happen; expressions no preset represents open Custom unchanged.

A live **Next fires** preview lists five upcoming server-local occurrences. An invalid expression replaces that list with one error line. Occurrences missed while the orchestrator was down do not pile up — every tick schedules strictly from now.

## Webhook triggers

Each webhook gets a URL (`POST /api/webhooks/<id>`) and a bearer secret shown once at creation/rotation; rotating is destructive and requires confirmation. Accepted bodies are appended to the trigger message as `Event payload:`. Size limits, rate budgets and their status codes are in the [API reference](/api#webhooks).

## Continuous triggers

A continuous trigger fires an interval (`@every 30m`, minimum 1 minute) after the bot's run **finishes** — a self-paced worker that keeps re-reading its own results instead of running on a fixed clock. Every completed run (ok or error) re-arms all enabled continuous triggers on that bot for one shot; if the bot is Blocked or disabled when the shot comes due, that fire is skipped and it re-arms after the next finished run. A new continuous trigger waits until the first run completes before its timer starts.

## Pausing

Every trigger has its own switch independent of the bot. Paused cards show `(paused)`; schedule triggers never catch-up-fire on resume (cron picks the next slot, `@every` counts from re-enable), continuous triggers wait for the next finished run, and webhooks are rejected after authentication. Disabling the whole bot dominates everything.
