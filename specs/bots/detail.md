# Bot detail modal

- The bot settings modal opens from the gear icon in the bot's chat sidebar (`../chat/sidebar.md`); the panel behind keeps showing the cards.
- The modal has four tabs:
  - `General` — labeled Name (required) and Instructions (optional textarea) fields, role, machine, Projects, Tags and Secrets pickers, and team membership. A fixed action row pinned to the bottom of the tab holds Save, Restart machine, Clear memory, Delete and Cancel. Saving applies immediately to the cards behind; Cancel asks to discard unsaved edits (`../ui/unsaved-changes.md`) before closing. The action row also offers “Save as template…” to create a reusable template from this bot (`../templates/manage.md`).
  - `Triggers` — master/detail editor for the bot's triggers (see `../triggers/editor.md`).
  - `Logs` — run history newest first: status, source (`schedule`/`manual`/`chat`/`watchdog`) and error or output text; a row expands inline into the run's replay (see `../runs/lifecycle.md`, `../runs/drill-down.md`).
  - `Stats` — lifetime and trailing-30-day token usage plus an optional trailing-30-day token budget field with Save (`../usage/tokens.md`).
- The modal's header bar carries the enable toggle switch (`Disabled` when off, `Enabled` when on; accessible checkbox-role slider with a sliding knob) and Stop while running, beside the close button.
- The active tab is marked; switching tabs with a dirty General tab, trigger editor or Stats budget asks to discard first (`../ui/unsaved-changes.md`), and changes nothing about the bot. Newly opened modals start on `General`.
- The modal keeps the same size regardless of which tab is active or how much content it holds; tab content scrolls inside it.
- The header's enable toggle and Stop act immediately; Restart machine, Delete and Clear memory ask for confirmation first (see `../ui/confirm.md`).
- The modal closes via its close button, Escape, or tapping outside; a dirty General tab, trigger editor or Stats budget asks first (`../ui/unsaved-changes.md`), and closing never changes the bot.
- On phones the modal spans the full screen.
- The header shows the bot's task and status per `task-and-status.md`.

See also: `interrupt.md` (Stop), `../triggers/model.md`, `dashboard.md`.
