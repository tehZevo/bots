# Run lifecycle

A run records one working period of a bot's agent loop — from an injected trigger message until the loop goes quiet.

- Starts as `running`, must always end in `ok` or `error`, even on crash.
- Fire-and-forget: POST `/api/bots/:id/run` returns 202 + runId immediately; results are polled from history.
- A trigger arriving while the bot is busy steers its active loop (recorded in the current run) instead of starting a second one; all pending steers drain together at each drain point, so one reply may answer several injections.
- Success stores the final assistant reply as output; failure stores the error message (partial text kept if any).
- History: newest first, last 50 per bot.
