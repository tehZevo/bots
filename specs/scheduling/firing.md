# Schedule firing

- A schedule is a cron expression or an interval like `@every 30m` (s/m/h/d).
- The scheduler ticks every 15 s and, for each enabled bot whose `next_run_at` has passed, injects a scheduled-trigger message into its context, then advances `next_run_at` to the next occurrence.
- A bot still processing is skipped — never two concurrent responses per bot.
- Disabled bots fire only on manual trigger; missed occurrences are not replayed after downtime.
