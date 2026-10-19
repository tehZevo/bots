# Chat messages

- The bot's chat opens in the right sidebar (see `chat-sidebar.md`): conversation history (user and assistant turns) plus a text input with Send.
- Sending posts `/api/bots/:id/messages`: the text enters persistent context as a user turn via the same steering path triggers use; an active loop is steered, otherwise a run starts (`runs/lifecycle.md`) with source `chat`.
- On send, your message renders immediately in the log (optimistic) even before the server confirms it; a typing indicator sits below the last turn until the first non-empty assistant reply arrives. Failed sends remove the optimistic turn and surface the error inline.
- The assistant's replies stream into the tab; history reloads complete on reopen.
- Assistant message text renders as GitHub-flavored markdown (headings, lists, code blocks, links) with HTML sanitized; user turns stay plain text.
- Each assistant turn labels itself with the bot's name instead of a generic "BOT" marker.
- Tool calls and thinking attach to their assistant turn as separate collapsible sections, collapsed by default: one section for thinking, one per tool call showing tool name plus input and output; expanded content scrolls within bounds.
- Send is unavailable while the bot is disabled; API errors surface inline in the tab without closing it.
- Chat turns are ordinary context: they appear in Logs and participate in compaction like any message.
