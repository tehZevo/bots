# Runs

Status: implemented

A run is one execution of a bot's task, triggered by schedule or manual request.

- Triggers: `schedule`, `manual`. (`hook`/`chat` triggers are planned, not yet specced.)
- A run record holds: `id`, `bot_id`, `status`, `trigger`, `started_at`, `finished_at`, `output`, `error`.
- Status lifecycle: `running` → terminal `ok` | `error`. Every run must reach a terminal status, including unexpected failures.
- Runs are fire-and-forget: starting one returns 202 with the `runId` immediately; results are polled via history.
- At most one concurrent run per bot; a manual trigger while running returns 409 already running.
- Run history is kept newest-first, last 50 exposed per bot (oldest trimmed on read only for now).
- On success the final assistant text is stored as `output`; on failure the message is stored in `error`.

## Scenarios

- Given an idle bot, When POST /api/bots/:id/run, Then 202 { runId } and a `running` row exists.
- Given a run whose LLM call throws, Then status becomes `error` with error text set.
- Given a running bot, When POST /run again, Then 409.
