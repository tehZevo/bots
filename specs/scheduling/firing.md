# Schedule firing

- A schedule trigger attaches to one bot and posts its task text into the bot's context on a timer: cron expression or interval like `@every 30m` (s/m/h/d).
- The scheduler ticks every 15 s; for each due trigger (`triggers/enable-disable.md`) of an enabled bot it injects that message, then advances the trigger to its next occurrence.
- Missed occurrences are not replayed after downtime (`triggers/enable-disable.md`).
