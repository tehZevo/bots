# Bots

A bot is a persistent agent loop: instructions + model + tools + memory. Cards show a one-line name (long names truncate with an ellipsis, full text on hover), the assigned role beneath it in italic muted `(role)` — no line at all for bots without a role — generated avatar (deterministic from the bot id — it blinks on a seeded cadence and floats/tilts per health level; disabled bots sit perfectly still), current task and health dot; filters match those health words exactly. While a loop is active the health dot itself stays steady and full-color — an outward-growing halo ring in the dot's status color carries the motion (each bot's halo runs on its own offset so card dots never sync). A visible gap separates the search/filter bar from the content below it on every main screen. A single control bar above the cards holds the name search with three labeled dropdown multiselects beside it — `Status:` (`Active`/`Idle`/`Issues`/`Blocked`/`Disabled`), a searchable `Role:` list including `(no role)`, and a `Tag:` list of defined tags (shown once tags exist); each shows `All` when nothing is selected, selections inside one dropdown OR together (a tag filter keeps bots carrying at least one chosen tag) and across dropdowns AND.

## Chat sidebar

Clicking a bot card opens that bot's chat in a closeable sidebar pinned to the right edge — the cards stay visible behind it. Your message appears instantly; user messages, thinking and tool calls show up as soon as they are available rather than waiting for the full turn, and while the bot is working a working indicator sits at the bottom-left of the chat. Chat turns enter the same persistent context as everything else. Trigger-injected messages (schedule ticks, manual runs, webhook events) appear in the chat as full-width bars spanning the conversation, clearly set apart from your turns and the bot's. Close it with its × button, Escape, or clicking outside; nothing about the bot changes. The gear icon in the sidebar header opens that bot's settings modal. Only one sidebar is open at a time — tapping another card switches it in place. On phones it spans the full screen.

## Detail tabs

The settings modal (opened from the chat sidebar's gear) holds:

- **General** — name and instructions editing, role, machine, projects and tags pickers, with Save disabled until one of them changes (see [Editors & unsaved changes](/editors)); enable toggle switch, Stop while running, Restart machine, Clear memory, Delete.
- **Triggers** — schedule and webhook triggers, each with its own pause switch ([details](/triggers-scheduling)).
- **Logs** — run history: trigger source, status (ok/error), output, errors.

## Lifecycle

- Enabling/disabling is instant and reflected in the dot (gray = disabled; nothing fires or injects while off).
- **Run now** — picked from each card's three-dot quick menu (see [Quick menu](#quick-menu)), starts a loop immediately with the default nudge (it never takes your words; that's chatting). The item spins until the bot's first action then returns to normal. It is disabled while the bot is disabled; blocked bots stay runnable since you may have fixed the blocker elsewhere. If a run is already in flight your poke **steers** it instead of queueing a second run.
- Stop interrupts the live loop mid-run; the run row records `interrupted`.
- **Global pause** — the Pause button in the status bar holds every bot at once (server-wide, any signed-in user). While paused nothing new starts: schedules skip their occurrences (no catch-up on resume), webhook POSTs are refused with 409, Run now is rejected, and a chat send is held instead of starting a run — held messages drain when you resume. A bot already mid-turn finishes it and goes quiet. Resume is one click; the state survives a restart.
- If the server crashes or restarts mid-run, boot finalizes those runs as `interrupted` (error) too — no run stays stuck in running.
- **Restart machine** (confirmation required) interrupts any live run, then stops and removes the bot's container. The next shell use recreates it lazily from the currently selected machine image — handy after switching machines or a broken install. `/workspace` and history persist; anything installed outside it disappears.
- Deleting a bot removes its triggers and run history (confirmation required — destructive actions are red).

## Quick menu

Every bot card carries a small three-dot button in the card header at the top of the card, immediately to the left of the status circle. Clicking it opens a compact menu anchored to the button; it never opens chat by itself. The menu lists common per-bot actions:

- **Open chat** — opens this bot's chat sidebar (unavailable while the bot is disabled).
- **Run now** — see [Lifecycle](#lifecycle); spins in-place until the first action of the run. Disabled while the bot is disabled or the bots are globally paused.
- **Stop** — interrupts the live loop; listed only while the bot is running.
- **Settings** — opens this bot's settings modal.
- **Clear memory** — drops stored context immediately, no confirmation.
- **Delete** — removes the bot (confirmation required).

The menu closes on selection, on outside click or on Escape, and is fully keyboard reachable: arrow keys plus Home/End move between items. Actions apply to that bot only; cards keep refreshing with the regular dashboard polling.

## Scope and replies

The trigger or chat message that starts a run is the bot's assignment. Bots stay on that task, mention adjacent issues instead of chasing them, and stop when it is done or blocked. Progress goes to the task and status line; chat gets one reply per run, not a running commentary. Scheduled and webhook runs follow the same rule.

## Memory

Conversation context persists across runs and survives restarts; when it grows past the configured token budget, older turns are compacted into a summary automatically. Clear memory resets the loop's stored context.

## Templates

Templates are reusable bundles — machine, role, description, instructions and optional starter triggers (message + schedule). Manage them under **Templates**: add from scratch, edit, or delete behind a confirm dialog; if a referenced machine or role is deleted the editor shows an inline warning.

- **Save as template…** in a bot's General tab copies its fields and schedule triggers into a new, editable template named `<bot> template`.
- The **Add bot** dialog offers a *Template* dropdown when templates exist: picking one pre-fills instructions, role and machine — everything stays editable before you hit Create.
- Instantiating copies values into fresh rows; starter triggers are created on the new bot, and template and bot stay fully independent afterwards.
