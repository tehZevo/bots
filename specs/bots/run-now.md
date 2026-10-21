# Run now

- Every bot card carries a small, always-visible "Run now" icon button with its own keyboard focus; clicking it fires `POST /api/bots/:id/run` with no message (the server's default nudge), while the card itself still opens chat (`../chat/sidebar.md`) — the button never does.
- The button is disabled while the bot is disabled. Blocked bots can still be run: blocking often reflects external state the user resolves outside this app.
- From click until the bot's first action in that run (a tool call or assistant reply) the button shows a spinner, then returns to normal; ongoing work afterwards reads from the existing status indicators (`status-colors.md`, `current-task.md`). A run that fails before any action simply stops the spinner.
- Run-now never takes user text — to say something specific, use chat. The injected message is tagged `manual`: it renders as an injected bar in chat (`../chat/messages.md`) and its run shows source `manual` in Logs (`../runs/lifecycle.md`).
