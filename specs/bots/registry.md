# Bot registry

A bot is a named agent with its own persistent context (see context/persistent-context.md).

- Stored per bot: name (required), optional description (display only), optional instructions (`system_prompt`), optional model override (null = server default), enabled flag.
- The effective system prompt sent to the model always starts from the generic default, then appends a name line — `You are "<bot name>".` — the bot's instructions, and finally role instructions and granted skill markdown (blank-line separated). Description is not part of the prompt.
- CRUD via `/api/bots`; invalid input returns 400 with an error message.
- Deleting a bot deletes its triggers, runs, and messages.
