# Bots

A bot is a named agent with a task, optional system prompt, a schedule, and an optional model override.

- Stored: name, task, system_prompt, schedule, model_id (null = server default), enabled, next_run_at, last_run_at.
- CRUD via `/api/bots`; name, task, and schedule are required — invalid input returns 400 with an error message.
- Changing the schedule recomputes `next_run_at`; other edits don't touch it.
- Deleting a bot deletes its runs and messages.
