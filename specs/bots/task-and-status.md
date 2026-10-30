# Task and status line

A bot exposes `current_task` — a long-running one-liner for what it is working on — with `status` beneath it: a short live substep of that task, e.g. progress ("running migration 3/5"), waiting ("rate-limited, backing off") or trouble ("API keeps rejecting my payload"). Both are null until set and render on cards and in the detail header per `dashboard.md`, status italic in the muted secondary color.

- The agent gets two tools: `set_current_task(text)` and `set_status(text, level?)`. Status tracks fine-grained progress while the task stays stable; setting or replacing a task clears status to null (substeps belong to their task). Empty text on either tool clears it.
- Neither tool takes a bot argument — both always target the running bot, never another one — and setting either never counts as output.
- `level` is `"ok"` (default), `"issue"` or `"blocked"`. A non-empty status at level `issue` turns the bot's health color yellow; `blocked` — the agent declares it cannot proceed — turns it red (`status-colors.md`). Clearing status removes either color. Agent-reported colors never replace system truth: a failing latest run stays red even after the agent reports `ok`, and system red always outranks agent yellow.
- Values persist across runs until replaced or cleared; Clear memory resets task and status to null together (`interrupt.md`).
- Any `set_current_task` or `set_status` call refreshes one shared last-updated timestamp, shown as a single relative-age label (e.g. `5m ago`) for the pair — never separate ages per line. Both truncate with ellipsis and expose full text via title.
- `GET /api/bots` includes `status`; run rows include `current_task` with its `updated_at`.
