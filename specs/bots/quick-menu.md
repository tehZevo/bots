# Bot card quick menu

- Every bot card carries a small "…" (three dots) icon button with its own keyboard focus, replacing the separate Run now button; clicking it opens a menu anchored to the button and never opens the chat (`../chat/sidebar.md`).
- The menu lists common actions for that bot: Open chat, Run now, Stop, Settings, Clear memory and Delete.
- Stop calls `POST /api/bots/:id/interrupt` and is listed only while the bot is running (`interrupt.md`); Run now calls `POST /api/bots/:id/run` (`run-now.md`).
- Clear memory and Delete ask for confirmation first (`../ui/confirm.md`); the other actions apply immediately.
- The menu closes on selection, on outside click and on Escape, and is reachable and dismissible by keyboard alone.
- Actions apply to that bot only; the cards behind refresh by polling (`dashboard.md`).
