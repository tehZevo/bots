# Bots

A bot is a persistent agent loop: instructions + model + tools + memory.

## Cards and filters

- Each card shows the name (long names truncate with an ellipsis, full text on hover), the assigned role beneath it in italic muted `(role)` — no line for bots without one — a generated avatar derived deterministically from the bot id (it blinks and floats per health level; disabled bots sit still), current task, and a health dot.
- While a loop is active the dot stays steady; an outward-growing halo ring in the dot's status color carries the motion, each card on its own offset so dots never sync. Filters match the health words exactly.
- A single control bar above the cards — visibly separated from the content below it on every main screen — holds the name search with three labeled dropdown multiselects beside it: `Status:` (`Active`/`Idle`/`Issues`/`Blocked`/`Disabled`), a searchable `Role:` list including `(no role)`, and a `Tag:` list of defined tags (shown once tags exist). Each shows `All` when nothing is selected; selections OR together inside one dropdown (a tag filter keeps bots carrying at least one chosen tag) and AND across dropdowns.

## Chat sidebar

- Clicking a bot card opens that bot's chat in a closeable sidebar pinned to the right edge — the cards stay visible behind it, and only one sidebar is open at a time; tapping another card switches it in place. On phones it spans the full screen.
- Your message appears instantly; user messages, thinking and tool calls stream in as they become available rather than waiting for the full turn, with a working indicator at the bottom-left of the chat while the bot works. Chat turns enter the same persistent context as everything else.
- While a bot is disabled, its composer and **Send** button are unavailable — opening a card's chat cannot submit a message that the server would reject.
- Trigger-injected messages (schedule ticks, manual runs, webhook events) appear as full-width bars spanning the conversation, clearly set apart from your turns and the bot's.
- Close with the × button, Escape, or clicking outside — nothing about the bot changes. The gear icon in the sidebar header opens that bot's settings modal.

## Detail tabs

The settings modal (opened from the chat sidebar's gear) holds:

- **General** — name and instructions editing, role, machine, projects and tags pickers, with Save disabled until one of them changes (see [Editors & unsaved changes](/editors)); enable toggle switch, Stop while running, Restart machine, Clear memory, Delete.
- **Triggers** — schedule and webhook triggers, each with its own pause switch ([details](/triggers-scheduling)).
- **Logs** — run history: trigger source, status (ok/error), output, errors. Clicking a row expands an inline transcript replay of that run — user, assistant, tool call and tool result steps in order, with per-step durations and retry waits where recorded; runs without stored linkage show "transcript not recorded". Tool results are redacted before storage and replay: exact matches of the bot's assigned secret values, provider API keys and declared MCP env values (≥8 chars) become `[REDACTED:<NAME>]` placeholders; your own chat text is never rewritten.
- **Stats** — token usage totals per bot: input, output, cache read/write and total for the lifetime and the last 30 days, from every recorded run. A **Current context (estimated)** section shows the live context split as a stacked bar with counts and percentages for system prompt, tool definitions, conversation and free space against the model's context window — estimated with the same estimator compaction uses (never provider usage, never calls the model), refreshed when the modal opens and every few seconds while a run is active; without a model it shows only the estimated used total. An optional trailing-30-day **token budget** (total tokens; empty = unlimited) can be set or cleared here with a progress bar; once usage is at or above it, new runs are refused without calling the model (`token budget exhausted`, a Blocked cue — raising or clearing the budget lets the next run proceed), and a run that reaches it mid-flight stops after its current turn keeping completed requests' usage.

## Lifecycle

- Enabling/disabling is instant and reflected in the dot (gray = disabled; nothing fires or injects while off).
- **Run now** — picked from each card's three-dot quick menu ([below](#quick-menu)), starts a loop immediately with the default nudge (it never takes your words; that's chatting). The item spins until the bot's first action then returns to normal, and is disabled while the bot is disabled or globally paused; blocked bots stay runnable since you may have fixed the blocker elsewhere. If a run is already in flight your poke **steers** it instead of queueing a second run.
- Stop interrupts the live loop mid-run; the run row records `interrupted`.
- A model request that fails transiently (HTTP 429/5xx or a connection error) is retried automatically — up to 3 retries with roughly doubling delay plus jitter, honoring a provider's `Retry-After` on 429s (capped at 60 s). The bot stays running while it waits; stopping interrupts the wait immediately. Other 4xx errors are never retried, and exhausted retries fail the run with the provider's error text (usage from completed requests is kept). This policy is server-wide and cannot be configured.
- **Global pause** — the Pause button in the status bar holds every bot at once (server-wide, any signed-in user). While paused nothing new starts: schedules skip their occurrences (no catch-up on resume), webhook POSTs are refused with 409, Run now is rejected, and a chat send is held instead of starting a run — held messages drain when you resume. A bot already mid-turn finishes it and goes quiet. Resume is one click; the state survives a restart.
- **Stop all** (panic button) sits beside the Pause toggle: after a confirm dialog it interrupts every running loop exactly like per-bot Stop (inference aborted, run recorded `interrupted`, context kept) and arms the global pause in the same action, so nothing instantly restarts. Idempotent — pressing it with nothing running still pauses; `POST /api/stop-all` reports how many loops were stopped.
- If the server crashes or restarts mid-run, boot finalizes those runs as `interrupted` (error) too — no run stays stuck in running.
- **Restart machine** (confirmation required) interrupts any live run, then stops and removes the bot's container. The next shell use recreates it lazily from the currently selected machine image — handy after switching machines or a broken install. `/workspace` and history persist; anything installed outside it disappears.
- Deleting a bot removes its triggers and run history (confirmation required — destructive actions are red).

## Quick menu

Every bot card carries a small three-dot button in the card header at the top of the card, immediately to the left of the status circle. Clicking it opens a compact menu anchored to the button; it never opens chat by itself. The menu lists common per-bot actions:

- **Open chat** — opens this bot's chat sidebar (unavailable while the bot is disabled).
- **Run now** — starts a loop with the default nudge; see [Lifecycle](#lifecycle).
- **Stop** — interrupts the live loop; listed only while the bot is running.
- **Settings** — opens this bot's settings modal.
- **Clear memory** — drops stored context (confirmation required, like everywhere else).
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
