# Schedule firing

- A schedule trigger attaches to one bot and posts its task text into the bot's context on a timer: cron expression or interval like `@every 30m` (s/m/h/d).
- The scheduler ticks every 15 s; for each due trigger of an enabled bot it injects that message, then advances the trigger to its next occurrence.
- Disabled bots never fire; missed occurrences are not replayed after downtime.
