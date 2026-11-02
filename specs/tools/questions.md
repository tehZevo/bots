# Bot questions

- Every bot has an `ask_user` tool: `ask_user(question, options[], allow_other?)` posts a question to a human and returns immediately with a question id — asking never pauses the run (approvals gate side effects; questions gather input).
- A question carries its text, two to six options and an optional free-text "Other" field, and stays pending until answered or cancelled; nothing expires.
- Pending questions are an Inbox source: the row shows the question with options as buttons (plus the Other input when allowed) answered inline, and a chat button that opens the bot's chat sidebar (`../ui/inbox.md`).
- Answering posts the chosen text as a user turn through the chat steering path — steering a live loop or starting a run — with source `question`; question and answer join persistent context like any turns.
- Any chat message the user sends to that bot cancels its pending questions (`../chat/messages.md`): talking directly supersedes queued choices; cancelled questions are recorded as cancelled and never wake the bot.
- While questions are pending, the bot's context carries a standing note listing them by id and text, so the model knows what it waits on and holds the related blocker until an answer arrives; unrelated work, triggers and chat continue normally.
- Question posts, answers and cancellations are audit entries (`../audit/log.md`); a pending question also shows in the chat log as a distinct marker line so transcripts stay honest.
- Global pause holds answers like chat sends; they drain on resume (`../bots/global-pause.md`).
