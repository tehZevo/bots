# Schedule firing

A schedule trigger posts its task text into the bot's context on a timer — a cron expression or an interval like `@every 30m` (s/m/h/d).

- The scheduler ticks every 15 s; for each due, enabled trigger of an enabled bot (`enable-disable.md`) it injects that message, then advances to the next occurrence.
- Missed occurrences are never replayed — after downtime or a pause the trigger simply schedules its next future occurrence (`enable-disable.md`).
