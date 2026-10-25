# Bot watchdog

- A bot may carry a watchdog: a maximum number of hours allowed between completed runs; unset means no watchdog.
- Idle time is measured from the start of the bot's most recent run; once it exceeds the limit with no newer run, the watchdog trips.
- A tripped watchdog records `error("watchdog: no completed run in Xh")` on the next scheduler tick and raises a Blocked condition (`../bots/status-colors.md`) plus an in-app notification (`../notifications/in-app.md`).
- Any newly started run clears the tripped state; the next completed run re-arms the watchdog. Disabled bots never trip while disabled, and resume measuring from their next run after enabling.
- The limit is edited in the bot detail `General` tab as whole hours from 1 to 720 (`../bots/detail.md`); anything else returns 400 with an error message.
- Evaluation runs inside the existing scheduler tick — no extra process, timer or model call; a watchdog trip never starts a run by itself.
- `GET /api/bots/:id/runs` shows tripped rows like any other run with source `watchdog`; the field is part of the bot row on `/api/bots`.
