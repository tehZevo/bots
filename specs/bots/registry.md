# Bot registry

A bot is a named agent with its own persistent context (see context/persistent-context.md).

Stored per bot: name (required), optional instructions, optional model override (null = server default), enabled flag, optional turn delay in seconds (0 = none, see `turn-delay.md`). There is no description or system-prompt field; migration folds any existing description or system prompt into instructions.
- The effective system prompt sent to the model starts from the generic default, then appends the name line — `You are "<bot name>".` — the assignment-scope rules (`assignment-scope.md`), the bot's instructions, role instructions, granted skill markdown, attached Project bodies (`projects/projects.md`) and the team membership section (`teams/messaging.md`), blank-line separated.
- CRUD via `/api/bots`; invalid input returns 400 with an error message.
- Deleting a bot deletes its triggers, runs, and messages.
