# Bot detail modal

- Clicking/tapping a bot card opens that bot's detail as a modal over the Bots tab; the panel behind keeps showing the cards.
- The modal has three tabs:
  - `General` — editable Name and Description fields with a Save button (blank names are rejected), the current status line, a Disable/Enabled toggle switch (plus Stop while running, Clear memory, Delete) and the role picker. Saving applies immediately to the cards behind.
  - `Triggers` — the bot's triggers with next fire times, remove per trigger, plus the add-trigger form.
  - `Logs` — run history newest first: status, source (`schedule`/`manual`) and error or output text (see `runs/lifecycle.md`).
- The active tab is marked; switching tabs changes nothing about the bot. Newly opened modals start on `General`.
- The modal keeps the same size regardless of which tab is active or how much content it holds; tab content scrolls inside it.
— the switch reads `Disabled` when off and `Enabled` when on, styled as an accessible checkbox-role slider with a sliding knob.
- Stop and the enable toggle act immediately; Delete and Clear memory ask for confirmation first (see `confirm.md`).
- The modal closes via its close button, Escape, or tapping outside; closing changes nothing about the bot.
- Tapping another card switches the modal to that bot in place; on phones the modal spans the full screen.

See also: `bots/interrupt.md` (Stop), `triggers/model.md`, `dashboard.md`.

- The detail header shows the bot's current task and status substep under its name when set — task plain, status italic muted below, one shared relative-age label for the pair (see `bots/status-line.md`); an empty status line clears with it.
