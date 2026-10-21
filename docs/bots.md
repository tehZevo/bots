# Bots

A bot is a persistent agent loop: instructions + model + tools + memory. Cards show a one-line name (long names truncate with an ellipsis, full text on hover), generated avatar (deterministic from the bot id — it blinks on a seeded cadence and floats/tilts per health level; disabled bots sit perfectly still), current task and health dot; filters match those health words exactly. A visible gap separates the search/filter bar from the content below it on every main screen. A single control bar above the cards holds the name search with two labeled dropdown multiselects beside it — `Status:` (`Active`/`Idle`/`Issues`/`Blocked`/`Disabled`) and a searchable `Role:` list including `(no role)`; both show `All` when nothing is selected, selections inside one dropdown OR together and across dropdowns AND.

## Chat sidebar

Clicking a bot card opens that bot's chat in a closeable sidebar pinned to the right edge — the cards stay visible behind it. Your message appears instantly; user messages, thinking and tool calls show up as soon as they are available rather than waiting for the full turn, and while the bot is working a working indicator sits at the bottom-left of the chat. Chat turns enter the same persistent context as everything else. Trigger-injected messages (schedule ticks, manual runs, webhook events) appear in the chat as full-width bars spanning the conversation, clearly set apart from your turns and the bot's. Close it with its × button, Escape, or clicking outside; nothing about the bot changes. The gear icon in the sidebar header opens that bot's settings modal. Only one sidebar is open at a time — tapping another card switches it in place. On phones it spans the full screen.

## Detail tabs

The settings modal (opened from the chat sidebar's gear) holds:

- **General** — name and instructions editing, role and machine pickers, with Save disabled until one of them changes (see [Editors & unsaved changes](/editors)); enable toggle switch, Stop while running, Restart machine, Clear memory, Delete.
- **Triggers** — schedule and webhook triggers, each with its own pause switch ([details](/triggers-scheduling)).
- **Logs** — run history: trigger source, status (ok/error), output, errors.

## Lifecycle

- Enabling/disabling is instant and reflected in the dot (gray = disabled; nothing fires or injects while off).
- **Run now** — the ⚡ badge on each card starts a loop immediately with the default nudge (it never takes your words; that's chatting). The button spins until the bot's first action, then the usual status indicators take over. It's disabled while the bot is disabled; blocked bots stay runnable since you may have fixed the blocker elsewhere. If a run is already in flight your poke **steers** it instead of queueing a second run.
- Stop interrupts the live loop mid-run; the run row records `interrupted`.
- If the server crashes or restarts mid-run, boot finalizes those runs as `interrupted` (error) too — no run stays stuck in running.
- **Restart machine** (confirmation required) interrupts any live run, then stops and removes the bot's container. The next shell use recreates it lazily from the currently selected machine image — handy after switching machines or a broken install. `/workspace` and history persist; anything installed outside it disappears.
- Deleting a bot removes its triggers and run history (confirmation required — destructive actions are red).

## Scope and replies

The trigger or chat message that starts a run is the bot's assignment. Bots stay on that task, mention adjacent issues instead of chasing them, and stop when it is done or blocked. Progress goes to the task and status line; chat gets one reply per run, not a running commentary. Scheduled and webhook runs follow the same rule.

## Memory

Conversation context persists across runs and survives restarts; when it grows past the configured token budget, older turns are compacted into a summary automatically. Clear memory resets the loop's stored context.

## Templates

Templates are reusable bundles — machine, role, description, instructions and optional starter triggers (message + schedule). Manage them under **Templates**: add from scratch, edit, or delete behind a confirm dialog; if a referenced machine or role is deleted the editor shows an inline warning.

- **Save as template…** in a bot's General tab copies its fields and schedule triggers into a new, editable template named `<bot> template`.
- The **Add bot** dialog offers a *Template* dropdown when templates exist: picking one pre-fills instructions, role and machine — everything stays editable before you hit Create.
- Instantiating copies values into fresh rows; starter triggers are created on the new bot, and template and bot stay fully independent afterwards.
