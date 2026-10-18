# Triggers & scheduling

Triggers inject messages into a bot's loop: the configured text, on a schedule or when someone calls a webhook URL.

## Schedule triggers

Accept standard cron expressions (`0 * * * *`) or relative intervals (`@every 30m`). The next fire time is shown on each trigger card; occurrences missed while the orchestrator was down do not pile up — every tick schedules strictly from now.

## Webhook triggers

Each webhook gets a URL (`POST /api/webhooks/<id>`) and a bearer secret, shown once at creation/rotation (rotating is destructive — confirm required). Requests authenticate first (`401` on bad token), then payload checks; bodies up to 64 KB are appended to the trigger message as `Event payload:`.

## Pausing

Every trigger has its own switch independent of the bot: paused cards mute and label themselves, schedule triggers never catch-up-fire on resume (cron picks the next slot, `@every` counts from the moment you re-enable), and webhooks answer `409 trigger is disabled` after auth. Disabling the whole bot dominates everything.
