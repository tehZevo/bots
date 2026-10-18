# Bot detail modal

- Clicking/tapping a bot card opens that bot's detail as a modal over the Bots tab; the panel behind keeps showing the cards.
- The modal has three tabs:
  - `General` — editable Name and Description fields with a Save button (blank names are rejected), the current status line, an enable toggle switch (`Disabled` when off, `Enabled` when on; accessible checkbox-role slider with a sliding knob) plus Stop while running, Restart machine, Clear memory and Delete, and the role picker. Saving applies immediately to the cards behind.
  - `Triggers` — master/detail editor for the bot's triggers (see `triggers-tab.md`).
  - `Logs` — run history newest first: status, source (`schedule`/`manual`) and error or output text (see `runs/lifecycle.md`).
- The active tab is marked; switching tabs changes nothing about the bot. Newly opened modals start on `General`.
- The modal keeps the same size regardless of which tab is active or how much content it holds; tab content scrolls inside it.
- Stop and the enable toggle act immediately; Restart machine, Delete and Clear memory ask for confirmation first (see `confirm.md`).
- The modal closes via its close button, Escape, or tapping outside; closing changes nothing about the bot.
- Tapping another card switches the modal to that bot in place; on phones the modal spans the full screen.

See also: `bots/interrupt.md` (Stop), `triggers/model.md`, `dashboard.md`.

- The detail header shows the bot's current task and status substep under its name when set — task plain, status italic muted below, one shared relative-age label for the pair (see `bots/status-line.md`); an empty status line clears with it.
