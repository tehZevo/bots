# Current task

- A bot exposes `current_task`: one line describing what it is working on; null until set.
- The agent gets a `set_current_task` tool that updates the value mid-run; empty string clears it.
- The value persists across runs until replaced or cleared; Clear memory resets it to null (`bots/interrupt.md`).
- `GET /api/bots` and run rows include `current_task` with its `updated_at`; setting it never counts as output. Task/status display and their shared timestamp live in `bots/status-line.md`.
- `set_current_task` takes no bot argument — it always targets the running bot; a bot cannot change another bot's task, only its own.
