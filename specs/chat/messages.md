# Chat messages

- The bot's chat opens in the right sidebar (see `sidebar.md`): conversation history (user and assistant turns) plus a text input with Send.
- The composer is a single row: the input fills the width with an inline send icon button at its trailing edge; Enter sends, Shift+Enter inserts a newline. No full-width block button sits under the input.
- Sending posts `/api/bots/:id/messages`: the text enters persistent context as a user turn via the same steering path triggers use; an active loop is steered, otherwise a run starts (`../runs/lifecycle.md`) with source `chat`.
- On send, your message renders immediately in the log (optimistic) even before the server confirms it. User messages, thinking and tool calls render as soon as they are available rather than waiting for the full turn to complete. Failed sends remove the optimistic turn and surface the error inline.
- The assistant's replies stream into the sidebar; history reloads complete on reopen. While the bot is working, a working indicator shows in the bottom-left of the chat.
- A bot answers a run with one reply when it is complete or blocked; it does not narrate intermediate steps as separate chat messages. Live progress appears in the task and status line instead (`../bots/task-and-status.md`).
- Assistant message text renders as GitHub-flavored markdown (headings, lists, code blocks, links) with HTML sanitized; user turns stay plain text.
- Each assistant turn labels itself with the bot's name instead of a generic "BOT" marker.
- Tool calls and thinking attach to their assistant turn as separate collapsible sections, collapsed by default: one section for thinking, one per tool call showing tool name plus input and output; expanded content scrolls within bounds.
- Additional messages sent while the bot is busy are queued and each steers the bot via the same path; the chat shows all queued messages.
- Send is unavailable while the bot is disabled; API errors surface inline in the sidebar without closing it.
- Chat turns are ordinary context: they appear in Logs and participate in compaction like any message.
- Trigger-injected messages render in the chat as a full-width system bar spanning the conversation — source label plus humanized time (e.g. `Scheduled run · 7:00 AM`) — visually distinct from user and bot turns; the raw `[schedule …]`/`[webhook …]` prefix text never appears in any bubble.
- The log separates days with centered date separators, and every turn reveals its timestamp on hover (or focus); timestamps use relative time for today and an absolute date otherwise.
