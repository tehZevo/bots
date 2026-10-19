# Bots

A bot is a persistent agent loop: system prompt + model + tools + memory. Cards show a one-line name (long names truncate with an ellipsis, full text on hover), generated avatar (deterministic from the bot id — it blinks on a seeded cadence and bobs/sways/shakes per health level; disabled bots sit perfectly still), current task and health dot; filters match those health words exactly. A visible gap separates the search/filter bar from the content below it on every main screen. A single control bar above the cards holds the name search with two labeled dropdown multiselects beside it — `Status:` (`Active`/`Idle`/`Issues`/`Blocked`/`Disabled`) and a searchable `Role:` list including `(no role)`; both show `All` when nothing is selected, selections inside one dropdown OR together and across dropdowns AND.

## Detail tabs

- **General** — name/description editing, role and machine pickers, with Save disabled until one of them changes; enable toggle switch, Stop while running, Restart machine, Clear memory, Delete.
- **Triggers** — schedule and webhook triggers, each with its own pause switch ([details](/triggers-scheduling)).
- **Chat** — talk to the bot directly; your message appears instantly and a typing indicator shows until the reply lands. Chat turns enter the same persistent context as everything else.
- **Logs** — run history: trigger source, status (ok/error), output, errors.

## Lifecycle

- Enabling/disabling is instant and reflected in the dot (gray = disabled; nothing fires or injects while off).
- "Run now" starts a loop immediately; if one is already running your message **steers** it instead of queueing a second run.
- Stop interrupts the live loop mid-run; the run row records `interrupted`.
- **Restart machine** (confirmation required) interrupts any live run, then stops and removes the bot's container. The next shell use recreates it lazily from the currently selected machine image — handy after switching machines or a broken install. `/workspace` and history persist; anything installed outside it disappears.
- Deleting a bot removes its triggers and run history (confirmation required — destructive actions are red).

## Memory

Conversation context persists across runs and survives restarts; when it grows past the configured token budget, older turns are compacted into a summary automatically. Clear memory resets the loop's stored context.

## Templates

Templates are reusable bundles — machine, role, description, system prompt and optional starter triggers (message + schedule). Manage them under **Templates**: add from scratch, edit, or delete behind a confirm dialog; if a referenced machine or role is deleted the editor shows an inline warning.

- **Save as template…** in a bot's General tab copies its fields and schedule triggers into a new, editable template named `<bot> template`.
- The **Add bot** dialog offers a *Template* dropdown when templates exist: picking one pre-fills description, system prompt, role and machine — everything stays editable before you hit Create.
- Instantiating copies values into fresh rows; starter triggers are created on the new bot, and template and bot stay fully independent afterwards.
