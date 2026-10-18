# Bot status line

- A bot exposes `task` (long-running "what I'm working on") and, beneath it, `status`: a short live substep of that task — progress ("running migration 3/5"), waiting ("rate-limited, backing off") or trouble ("API keeps rejecting my payload"). Shown under the task on cards and in the detail header, italic in the muted secondary color; null until set.
- The agent gets a `set_status(text, level?)` tool — separate from `set_current_task`: status tracks fine-grained progress inside a task while the task stays stable. Setting or replacing the current task clears status to null (substeps belong to their task). Empty status text clears it.
- `level` is `"ok"` (default) or `"issue"`. A non-empty status with level `issue` turns the bot's health color yellow (`web-ui/status-colors.md`); clearing status removes the yellow. Red stays system-derived and always overrides agent-reported yellow.
- `set_status` takes no bot argument — it always targets the running bot; setting status never counts as output. `GET /api/bots` includes `status`; Clear memory resets task and status to null together.
