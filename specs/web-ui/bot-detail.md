# Bot detail modal

- Clicking/tapping a bot card opens that bot's detail as a modal over the Bots tab; the panel behind keeps showing the cards.
- The modal has three tabs:
  - `General` — current status line, controls (Stop while running, Enable/Disable, Clear memory, Delete) and the role picker.
  - `Triggers` — the bot's triggers with next fire times, remove per trigger, plus the add-trigger form.
  - `Logs` — run history newest first: status, source (`schedule`/`manual`) and error or output text (see `runs/lifecycle.md`).
- The active tab is marked; switching tabs changes nothing about the bot. Newly opened modals start on `General`.
- The modal keeps the same size regardless of which tab is active or how much content it holds; tab content scrolls inside it.
- Stop, Enable/Disable act immediately; Delete and Clear memory ask for confirmation first (see `confirm.md`).
- The modal closes via its close button, Escape, or tapping outside; closing changes nothing about the bot.
- Tapping another card switches the modal to that bot in place; on phones the modal spans the full screen.

See also: `bots/interrupt.md` (Stop), `triggers/model.md`, `dashboard.md`.
