# Trigger model

A trigger is a wake-up source attached to exactly one bot; firing injects its message into the bot's persistent context (see `context/persistent-context.md`) — it never starts a separate session.

- Every trigger has: an optional name, kind, message, and kind-specific config; stored per bot with CRUD through `/api/bots/:id/triggers`.
- Kinds: `schedule` (cron or `@every`, see `scheduling/firing.md`), `webhook` (inbound HTTP, see `triggers/webhooks.md`), and `continuous` (fires a fixed interval after a run finishes, see `triggers/continuous.md`); further kinds add only their own config and a source that calls the same injection path — no new entities.
- Invalid kind or config returns 400 with an error message; deleting a trigger stops its future fires but keeps past runs.
- Each fire produces one run row per `runs/lifecycle.md`, regardless of kind.
- Future kinds (external hooks, chat, and others) add only their own config and a source that calls the same injection path — no new entities, no secrets yet (see ROADMAP).
