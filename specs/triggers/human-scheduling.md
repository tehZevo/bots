# Human-friendly scheduling

- The trigger editor's schedule field keeps stored values exactly as today (`@every <interval>` or cron, `model.md`) but is edited through plain-language controls: Every (N minutes/hours/days) · Daily (time) · Weekdays (time) · Weekly (days + time) · Monthly (day + time) · Custom.
- Each choice renders one live sentence — e.g. "Runs every day at 09:30" or "Runs every 30 minutes" — above the controls; that sentence is the user-facing truth, not the expression.
- Saving maps the selection back to `@every`/cron (`*/N`, fixed minute-hour, weekday list, `D at HH:MM`); Custom opens the raw cron input with the same live sentence when interpretable, else a muted "Custom schedule" line.
- Opening a trigger whose expression no preset represents (odd intervals, multiple times per day) lands on Custom with the raw value — nothing is silently rewritten (`../ui/forms.md`).
- A Next fires preview lists the next 5 occurrences as local date-time lines under the controls, updating live while editing; invalid expressions replace the list with a single error line. Times are server-local everywhere — no per-bot timezone exists.
- API: `POST /api/schedule/preview` `{ schedule }` → `{ valid, next: [iso timestamps] }`, max 5 entries, any signed-in user (`../auth/multi-user.md`).
