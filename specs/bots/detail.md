# Bot detail modal

- The bot settings modal opens from the gear icon in the bot's chat sidebar (`../chat/sidebar.md`); the panel behind keeps showing the cards.
- The modal has three tabs:
  - `General` — labeled Name (required) and Instructions (optional textarea) fields, role, machine and Projects pickers, and team membership. A fixed action row pinned to the bottom of the tab holds Save, Restart machine, Clear memory, Delete and Cancel. Saving applies immediately to the cards behind; Cancel closes the modal discarding unsaved edits. The action row also offers “Save as template…” to create a reusable template from this bot (`templates.md`).
  - `Triggers` — master/detail editor for the bot's triggers (see `../triggers/editor.md`).
  - `Logs` — run history newest first: status, source (`schedule`/`manual`/`chat`) and error or output text (see `../runs/lifecycle.md`).
- The modal's header bar carries the enable toggle switch (`Disabled` when off, `Enabled` when on; accessible checkbox-role slider with a sliding knob) and Stop while running, beside the close button.
- The active tab is marked; switching tabs changes nothing about the bot. Newly opened modals start on `General`.
- The modal keeps the same size regardless of which tab is active or how much content it holds; tab content scrolls inside it.
- The header's enable toggle and Stop act immediately; Restart machine, Delete and Clear memory ask for confirmation first (see `../ui/confirm.md`).
- The modal closes via its close button, Escape, or tapping outside; closing changes nothing about the bot.
- On phones the modal spans the full screen.
- The header shows the bot's task and status per `status-line.md`.

See also: `interrupt.md` (Stop), `../triggers/model.md`, `dashboard.md`.
