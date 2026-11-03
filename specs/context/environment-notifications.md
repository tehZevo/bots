# Environment notifications

- When the bot's environment changes, the bot gets a notification in its per-bot queue: project body edits, attaches and detaches; role instruction edits; skill grant changes and skill content updates; team membership and leader changes; secret attach/detach (name only, never a value); machine switch.
- Notifications never wake an idle bot, never steer a live loop and never interrupt an in-flight request — mail, not phone calls.
- The queue drains at the bot's next model request boundary: run start when idle, turn boundary when running (the same injection point steering uses).
- Each queued source drains as its own injected turn carrying a `[notify …]` source tag, shaped exactly like trigger injection (`../chat/messages.md`); repeated events for one source collapse to a single line with the newest timestamp, so a burst of fifty project edits drains as one message.
- Delivery rides user-role injection, never provider system messages: strict chat templates reject system messages mid-conversation, and the app must work against any OpenAI-compatible endpoint; the system-authored quality lives in the source tag and UI, not the wire role.
- Prompt-visible changes (project/role/skill text) still apply to the system prompt as usual; the notification states the event, not the content, so the model knows what changed and when.
- Chat and Logs show queued notifications as full-width system bars like trigger injections: pending ones marked queued, drained ones delivered with their timestamp; the model sees only the drained turns.
- Drained notifications are ordinary context messages and compact like everything else; the queue itself is server state, capped per source, never a wake source.
- API: `GET /api/bots/:id/notifications` lists the queue with state; there is no create, edit or delete — events write it, drains empty it.
