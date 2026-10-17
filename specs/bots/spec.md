# Bots

Status: implemented

A bot is a named, persistent agent defined by a task, an optional system prompt, a schedule, and an optional model override.

- The system stores bots with: `id` (server-generated UUID), `name`, `task`, `system_prompt`, `schedule`, `model_id` (nullable — falls back to the default model), `enabled`, `next_run_at`, `last_run_at`, `created_at`.
- The API supports create, list, get, update (partial), and delete of bots at `/api/bots`.
- Validation: `name` and `task` are required non-empty; `schedule` is required and must parse (see scheduling spec). Invalid input returns 400 with an `error` message.
- Updating the schedule recomputes `next_run_at`; other edits leave it untouched.
- Deleting a bot cascades: its runs and messages are removed.

## Scenarios

- Given no bots exist, When GET /api/bots, Then [] is returned.
- Given POST /api/bots with blank name, Then 400 { error }.
- Given an existing bot, When PATCH changes only the task, Then next_run_at is unchanged.
