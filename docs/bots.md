# Bots

A bot is a persistent agent loop: system prompt + model + tools + memory. Cards show name, generated avatar (deterministic from the bot id), current task and health dot; filters match those health words exactly.

## Detail tabs

- **General** — name/description editing (Save activates only when something changed), enable toggle switch, role picker, Stop while running, Clear memory, Delete.
- **Triggers** — schedule and webhook triggers, each with its own pause switch ([details](/triggers-scheduling)).
- **Chat** — talk to the bot directly; your message appears instantly and a typing indicator shows until the reply lands. Chat turns enter the same persistent context as everything else.
- **Logs** — run history: trigger source, status (ok/error), output, errors.

## Lifecycle

- Enabling/disabling is instant and reflected in the dot (gray = disabled; nothing fires or injects while off).
- "Run now" starts a loop immediately; if one is already running your message **steers** it instead of queueing a second run.
- Stop interrupts the live loop mid-run; the run row records `interrupted`.
- Deleting a bot removes its triggers and run history (confirmation required — destructive actions are red).

## Memory

Conversation context persists across runs and survives restarts; when it grows past the configured token budget, older turns are compacted into a summary automatically. Clear memory resets the loop's stored context.
