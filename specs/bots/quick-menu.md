# Bot card quick menu

- Every bot card carries a small horizontal "⋯" (three dots) icon button in the card's header at the top of the card, immediately to the left of the status circle (`dashboard.md`), with no visually distinct container (no pill, border, background or raised surface); it has its own keyboard focus, replaces the separate Run now button, and clicking it opens a menu anchored to the button and never opens the chat (`../chat/sidebar.md`).
- The menu lists common actions for that bot: Open chat, Run now, Stop, Settings, Clear memory and Delete.
- Stop calls `POST /api/bots/:id/interrupt` and is listed only while the bot is running (`interrupt.md`); Run now calls `POST /api/bots/:id/run` (`run-now.md`).
- Clear memory and Delete ask for confirmation first (`../ui/confirm.md`); the other actions apply immediately.
- The menu closes on selection, on outside click and on Escape, and is reachable and dismissible by keyboard alone.
- Actions apply to that bot only; the cards behind refresh by polling (`dashboard.md`).
