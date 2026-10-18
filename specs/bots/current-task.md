# Current task

- A bot exposes `current_task`: one line describing what it is working on, shown on the card and detail header; null until set.
- The agent gets a `set_current_task` tool that updates the value mid-run; empty string clears it.
- The value persists across runs until replaced or cleared; Clear memory resets it to null (see `bots/interrupt.md`).
- The card and detail header also show how long ago the status block was last touched — updating either task or status refreshes this single shared timestamp (`bots/status-line.md`) — rendered relatively (e.g. `5m ago`); the UI refreshes the elapsed label while open.
- `GET /api/bots` and run rows include `current_task` with its `updated_at`; setting it never counts as output. Clearing sets both to null.
- `set_current_task` takes no bot argument — it always targets the running bot; a bot cannot change another bot's task, only its own.
