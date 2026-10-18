# Current task

- A bot exposes `current_task`: one line describing what it is working on, shown on the card and detail header; null until set.
- The agent gets a `set_current_task` tool that updates the value mid-run; empty string clears it.
- The value persists across runs until replaced or cleared; Clear memory resets it to null (see `bots/interrupt.md`).
- `GET /api/bots` and run rows include `current_task`; setting it never counts as output.
