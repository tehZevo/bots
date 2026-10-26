# Triggers tab layout

- The bot detail `Triggers` tab is a master/detail view: the left list holds the bot's triggers with "+ Add trigger" pinned above it; the right pane edits the selected one. Opening the tab selects the first trigger, or shows an empty state with just "+ Add trigger".
- Rows show the name on top (its schedule, webhook or continuous label when unnamed) and, muted italic below, the type (`Schedule` / `Webhook` / `Continuous`) plus `(paused)` when disabled. Selecting a row marks it active, asks to discard first when the editor is dirty (`../ui/unsaved-changes.md`), and changes nothing about the bot.
- The editor holds: optional name, message text, schedule (cron / `@every`) or continuous interval for their kinds, enable toggle, webhook URL and rotate secret (`../ui/confirm.md`), and Remove at the bottom. Nothing mutates on typing; "Save" follows the dirty-state rule (`../ui/forms.md`).
- The one-time webhook secret display carries a `?` help icon explaining usage: POST the event payload to the trigger's URL with the secret as `Authorization: Bearer <secret>`.
- "+ Add trigger" opens a blank draft in the same pane, kind picker first (labeled `Type`), no decorative separators; a dirty editor asks to discard first. Create adds and selects the trigger; Cancel asks to discard a dirty draft and never calls the API.
- On phones the list collapses above the editor; selecting scrolls to it, and its back control follows the same dirty-leave rule.
