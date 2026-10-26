# Continuous trigger

- `continuous` is a trigger kind: instead of a fixed clock, it schedules its next fire a configured interval (`N` minutes/hours/days, `@every`-style) after the bot's run finishes.
- When a run ends (`ok` or `error`), each enabled continuous trigger on that bot arms a one-shot timer for its interval; when it fires, it injects its message like any other trigger (`model.md`).
- If the bot is blocked or disabled when the timer fires, that fire is skipped and the trigger re-arms only after the next completed run — continuous triggers never run a blocked/disabled bot.
- A run that is steered while busy does not count as "finished"; the timer arms only when the loop actually goes quiet. Disabled triggers never arm (`enable-disable.md`).
- Creating/editing a continuous trigger validates the interval (`s/m/h/d`, minimum 1 minute) and returns 400 on invalid input; it appears on the Triggers tab with its interval shown.
