# Per-trigger enable/disable

- Every trigger carries its own `enabled` flag (default on); a disabled trigger never fires while the bot itself stays enabled.
- The scheduler only considers due triggers with `enabled = 1`. Occurrences that pass while paused are skipped outright — resuming never catch-up-fires; the trigger simply schedules its next future occurrence (`@every` counts from the resume moment, cron picks the next matching slot).
- A webhook POST to a disabled trigger authenticates first (401 on bad secret), then returns 409 `trigger is disabled` before any payload checks — pause means "not accepted right now", not "gone".
- `PATCH /api/triggers/:id` accepts the boolean; the Triggers tab shows a toggle in the selected trigger's editor and mutes paused rows in the list so state reads at a glance (`web-ui/triggers-tab.md`, `web-ui/visual-style.md`).
- Bot-level disable still dominates: while the bot is off nothing fires or injects regardless of trigger flags.
