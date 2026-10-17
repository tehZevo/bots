# Bot registry

A bot is a named agent with its own persistent context (see context/persistent-context.md).

- Stored per bot: name (required), optional system prompt, optional model override (null = server default), enabled flag.
- CRUD via `/api/bots`; invalid input returns 400 with an error message.
- Deleting a bot deletes its triggers, runs, and messages.
