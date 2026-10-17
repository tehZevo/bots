# Run lifecycle

A run is one response cycle, from a trigger message entering a bot's context to the assistant's final reply (see context/persistent-context.md).

- Starts as `running`, must always end in `ok` or `error`, even on crash.
- Fire-and-forget: POST `/api/bots/:id/run` returns 202 + runId immediately; results are polled from history.
- Manual trigger while the bot is still processing → 409.
- Success stores the final assistant reply as output; failure stores the error message (partial text kept if any).
- History: newest first, last 50 per bot.
