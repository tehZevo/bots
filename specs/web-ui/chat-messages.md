# Chat messages

- The bot detail modal has a fourth tab: `Chat` — conversation history (user and assistant turns) plus a text input with Send.
- Sending posts `/api/bots/:id/messages`: the text enters persistent context as a user turn via the same steering path triggers use; an active loop is steered, otherwise a run starts (`runs/lifecycle.md`) with source `chat`.
- On send, your message renders immediately in the log (optimistic) even before the server confirms it; a typing indicator sits below the last turn until the first non-empty assistant reply arrives. Failed sends remove the optimistic turn and surface the error inline.
- The assistant's replies stream into the tab; history reloads complete on reopen.
- Send is unavailable while the bot is disabled; API errors surface inline in the tab without closing it.
- Chat turns are ordinary context: they appear in Logs and participate in compaction like any message.
