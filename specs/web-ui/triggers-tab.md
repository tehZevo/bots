# Triggers tab layout

- The bot detail `Triggers` tab is a master/detail view: a left-hand list of the bot's triggers with a "+ Add trigger" button pinned above it; the right pane shows the selected trigger.
- List rows show the trigger's schedule or webhook label and a small health cue (paused = muted); selecting a row marks it active and changes nothing about the bot. Opening the tab selects the first trigger, or shows an empty-state with just "+ Add trigger" when there are none.
- The right pane is an editor for the selected trigger: message text, schedule (cron / `@every`) for schedule triggers, enable toggle, rotate secret and webhook URL (with its reveal/rotate confirmations) for webhooks, and Remove at the bottom. Edits save via "Save" only — nothing mutates on typing; Save follows the dirty-state rule (`forms.md`).
- "+ Add trigger" opens a blank draft in the same right pane (kind picker first); Create adds it to the list and selects it; Cancel discards without API calls.
- On phones the list collapses above the editor; selecting scrolls to the editor, which carries a back control to the list.
