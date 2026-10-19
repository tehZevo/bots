# Bot registry

A bot is a named agent with its own persistent context (see context/persistent-context.md).

Stored per bot: name (required), optional instructions, an optional advanced system-prompt override, optional model override (null = server default), enabled flag. There is no description field; migration folds any existing description into instructions and keeps the old system prompt as the override.
- The effective system prompt sent to the model is composed in order: a name line — `You are "<bot name>".` — then the bot's instructions, then role instructions and granted skill markdown (blank-line separated); with none of these set, a generic default applies. When the system-prompt override is non-empty it replaces the name line and instructions entirely; role and skill layers still append.
- CRUD via `/api/bots`; invalid input returns 400 with an error message.
- Deleting a bot deletes its triggers, runs, and messages.
