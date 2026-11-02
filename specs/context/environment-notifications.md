# Environment notifications

- When the bot's environment changes, the bot gets a notification in its per-bot queue: project body edits, attaches and detaches; role instruction edits; skill grant changes and skill content updates; team membership and leader changes; secret attach/detach (name only, never a value); machine switch.
- Notifications never wake an idle bot, never steer a live loop and never interrupt an in-flight request — mail, not phone calls.
- The queue drains at the bot's next model request boundary: run start when idle, turn boundary when running (the same injection point steering uses), coalescing everything pending into one system-authored conversation turn ("Since your last update: …").
- Repeated events for the same source collapse to one line with the newest timestamp; a burst of fifty project edits drains as a single notification.
- Prompt-visible changes (project/role/skill text) still apply to the system prompt as usual; the notification states the event, not the content, so the model knows what changed and when.
- Chat and Logs show queued notifications as full-width system bars like trigger injections (`../chat/messages.md`): pending ones marked queued, drained ones delivered with their timestamp; the model sees only the drained turn.
- Drained notifications are ordinary context messages and compact like everything else; the queue itself is server state, capped per source, never a wake source.
- API: `GET /api/bots/:id/notifications` lists the queue with state; there is no create, edit or delete — events write it, drains empty it.
