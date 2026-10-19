# Bot registry

A bot is a named agent with its own persistent context (see context/persistent-context.md).

Stored per bot: name (required), optional instructions, optional model override (null = server default), enabled flag. There is no description or system-prompt field; migration folds any existing description or system prompt into instructions.
- The effective system prompt sent to the model always starts from the generic default, then appends a name line — `You are "<bot name>".` — the bot's instructions, and finally role instructions and granted skill markdown (blank-line separated).
- CRUD via `/api/bots`; invalid input returns 400 with an error message.
- Deleting a bot deletes its triggers, runs, and messages.
