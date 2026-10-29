# Triggers & scheduling

Triggers inject messages into a bot's loop: the configured text, on a schedule, when someone calls a webhook URL, or a fixed interval after each run finishes.

Triggers can carry an optional short name. The Triggers tab lists each trigger with its name (or the raw schedule / `webhook <id>` label when unnamed) on the top line and, beneath it in muted italic, the type — `Schedule`, `Webhook` or `Continuous` — plus `(paused)` while disabled. Name the ones you operate by hand; leave throwaways anonymous.

## Schedule triggers

Accept standard cron expressions (`0 * * * *`) or relative intervals (`@every 30m`). The next fire time is shown on each trigger card; occurrences missed while the orchestrator was down do not pile up — every tick schedules strictly from now.

## Webhook triggers

Each webhook gets a URL (`POST /api/webhooks/<id>`) and a bearer secret, shown once at creation/rotation (rotating is destructive — confirm required). Bodies over 64 KB answer `413` before rate limiting; deliveries are capped at 60 requests/min overall and 30 requests/min per trigger id (`429 { "error": "rate_limited" }`). Valid-sized requests then authenticate (`401` on bad token), with bodies up to 64 KB appended to the trigger message as `Event payload:`.

## Continuous triggers

A continuous trigger fires an interval (`@every 30m`, minimum 1 minute) after the bot's run **finishes** — a self-paced worker that keeps re-reading its own results instead of running on a fixed clock. Every completed run (ok or error) re-arms all enabled continuous triggers on that bot for one shot; if the bot is Blocked or disabled when the shot comes due, that fire is skipped and it re-arms after the next finished run. A new continuous trigger waits until the first run completes before its timer starts.

## Pausing

Every trigger has its own switch independent of the bot: paused cards mute and label themselves, schedule triggers never catch-up-fire on resume (cron picks the next slot, `@every` counts from the moment you re-enable), continuous triggers simply wait for the next finished run, and webhooks answer `409 trigger is disabled` after auth. Disabling the whole bot dominates everything.
