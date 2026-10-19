# Trigger model

A trigger is a wake-up source attached to exactly one bot; firing injects its message into the bot's persistent context (see `context/persistent-context.md`) — it never starts a separate session.

- Every trigger has: an optional name, kind, message, and kind-specific config; stored per bot with CRUD through `/api/bots/:id/triggers`.
- Implemented kinds: `schedule` — cron expression or `@every <interval>` (see `scheduling/firing.md`) — and `webhook` (see `triggers/webhooks.md`).
- Invalid kind or config returns 400 with an error message; deleting a trigger stops its future fires but keeps past runs.
- Each fire produces one run row per `runs/lifecycle.md`, regardless of kind.
- Chat messages use the same injection path with source `chat` (`web-ui/chat-messages.md`).
