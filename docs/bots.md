# Bots

A bot is a persistent agent loop: system prompt + model + tools + memory. Cards show name, generated avatar (deterministic from the bot id — it blinks on a seeded cadence and bobs/sways/shakes per health level; disabled bots sit perfectly still), current task and health dot; filters match those health words exactly. Above the cards sit a name search plus two labeled dropdown multiselects — `Status:` (`Active`/`Idle`/`Issues`/`Blocked`/`Disabled`) and a searchable `Role:` list including `(no role)`; both show `All` when nothing is selected, selections inside one dropdown OR together and across dropdowns AND.

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
