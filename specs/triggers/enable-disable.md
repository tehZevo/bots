# Per-trigger enable/disable

- Every trigger carries its own `enabled` flag (default on); a disabled trigger never fires while the bot itself stays enabled.
- The scheduler only considers due triggers with `enabled = 1`; pausing a schedule does not advance or reset its next occurrence, and resuming recomputes from "now" if it fell behind.
- A webhook POST to a disabled trigger authenticates first (401 on bad secret), then returns 409 `trigger is disabled` before any payload checks — pause means "not accepted right now", not "gone".
- `PATCH /api/triggers/:id` accepts the boolean; the Triggers tab shows a toggle per card, with disabled cards muted and labeled so state reads at a glance (`web-ui/visual-style.md`).
- Bot-level disable still dominates: while the bot is off nothing fires or injects regardless of trigger flags.
