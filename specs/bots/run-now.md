# Run now

- Run now lives in the bot card quick menu (`quick-menu.md`); picking it fires `POST /api/bots/:id/run` with no message (the server's default nudge).
- The menu item is disabled while the bot is disabled. Blocked bots can still be run: blocking often reflects external state the user resolves outside this app.
- From selection until the bot's first action in that run (a tool call or assistant reply) the card's menu button shows a spinner, then returns to normal; ongoing work afterwards reads from the existing status indicators (`status-colors.md`, `task-and-status.md`). A run that fails before any action simply stops the spinner.
- Run-now never takes user text — to say something specific, use chat. The injected message is tagged `manual`: it renders as an injected bar in chat (`../chat/messages.md`) and its run shows source `manual` in Logs (`../runs/lifecycle.md`).
