# Runs

A run is one execution of a bot's task, triggered by `schedule` or `manual`.

- Starts as `running`, must always end in `ok` or `error`, even on crash.
- Fire-and-forget: POST `/api/bots/:id/run` returns 202 + runId immediately; results are polled from history.
- Manual trigger while already running → 409.
- Success stores the final assistant text as output; failure stores the error message (partial text kept if any).
- History: newest first, last 50 per bot.
