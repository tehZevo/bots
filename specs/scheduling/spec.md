# Scheduling

- A schedule is a cron expression or an interval like `@every 30m` (s/m/h/d).
- The scheduler ticks every 15 s, fires enabled bots whose `next_run_at` has passed, then advances it to the next occurrence.
- A bot already running is skipped — never two runs of the same bot at once.
- Disabled bots only run manually; missed occurrences are not replayed after downtime.
