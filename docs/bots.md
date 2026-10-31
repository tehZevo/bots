# Bots

A bot is a persistent agent loop: instructions + model + tools + memory.

## Cards and filters

- Each card shows the name, assigned role (bots without one show no role line), current task, and a health dot with the levels listed in [Getting started](/getting-started#health-levels-at-a-glance). Filters match the health words exactly; accepted actions flip the dot at once — a chat send or **Run now** to Active, Stop (or **Stop all**, for every affected bot) back to Idle — and the next poll confirms or corrects.
- A control bar above the cards holds the name search plus three labeled dropdown multiselects: `Status:` (`Active`/`Idle`/`Issues`/`Blocked`/`Disabled`), a searchable `Role:` list including `(no role)`, and a `Tag:` list of defined tags (shown once tags exist). Each shows `All` when nothing is selected; selections OR together inside one dropdown (a tag filter keeps bots carrying at least one chosen tag) and AND across dropdowns.
- Archived bots are hidden by default. The **Include archived** checkbox adds them back with an `Archived` badge, and clicking one opens its details instead of chat ([archive lifecycle](#lifecycle)).

## Chat sidebar

- Clicking a bot card opens that bot's chat in a closeable sidebar; the cards stay visible behind it and tapping another card switches it in place. Archived cards bypass chat and open details directly. Close with the × button, Escape, or clicking outside — nothing about the bot changes. The gear icon in the header opens that bot's settings modal.
- Your message appears instantly; user messages, thinking and tool calls stream in as they become available rather than waiting for the full turn, and a working indicator names the bot while the loop works. Chat turns enter the same persistent context as everything else. Trigger-injected messages (schedule ticks, manual runs, webhook events) appear set apart from your turns and the bot's. Opening a chat lands on the newest message, and the view keeps following new activity while you sit at the bottom; scroll up to read history and it stops pulling you back down until you return to the bottom.
- While a bot is disabled, its composer and **Send** button are unavailable — opening a card's chat cannot submit a message that the server would reject.

## Detail tabs

The settings modal (opened from the chat sidebar's gear) holds:

- **General** — labeled name and watchdog fields, related role/model/machine/sound selectors in one responsive row with each label above its control, projects, tags, secrets and team pickers, plus Save (disabled until one of them changes), Restart machine, Clear memory, “Save as template…” ([Templates](/templates)), Archive or Unarchive, Delete and Cancel ([Editors & unsaved changes](/editors)). The instructions textarea expands to fill the remaining tab height. The modal header carries the enable toggle and Stop while running; archived bots keep the toggle off, grayed out and unclickable — unarchive first to re-enable. The optional watchdog limit accepts whole hours from 1 to 720; leave it empty for off.
- **Triggers** — schedule, webhook and continuous triggers, each with its own pause switch ([details](/triggers-scheduling)).
- **Logs** — run history: trigger source, status (ok/error), output, errors. A row expands into a transcript replay of user, assistant, tool-call and tool-result steps in order, with per-step durations and retry waits where recorded; runs without stored linkage say "transcript not recorded". User-message steps offer **Run this**, which starts a fresh manual run with that exact message — disabled while the bot is already running. Tool results are redacted before storage and replay; see [Secrets](/secrets#redaction).
- **Stats** — token usage totals per bot (input, output, cache read/write, total for lifetime and last 30 days) plus an estimated current-context split against the model's context window, refreshed while a run is active. An optional trailing-30-day **token budget** (empty = unlimited) can be set or cleared here: once usage is at or above it, new runs are refused without calling the model (`token budget exhausted`, a Blocked cue — raising or clearing it lets the next run proceed), and a run that reaches it mid-flight stops after its current turn keeping completed requests' usage.
- **Files** — browse the bot's `/workspace` straight from the host, strictly read-only; file mutation stays the agent's job through `shell`. [Machines](/machines#workspace-files) owns the browsing rules and API.

## Lifecycle

- Enabling/disabling is instant: nothing fires or injects while a bot is off.
- **Archive** stops any live loop, hides the bot from the default dashboard, freezes schedules, webhooks and watchdog clocks, and rejects chat and Run now; settings and history are retained. Unarchiving returns it disabled — enable it again to resume. Archiving a running bot asks for confirmation first.
- **Run now** — picked from each card's quick menu ([below](#quick-menu)) — starts a loop immediately with the default nudge (it never takes your words; that's chatting), and is unavailable while the bot is archived, disabled or globally paused; blocked bots stay runnable since you may have fixed the blocker elsewhere. If a run is already in flight your poke **steers** it instead of queueing a second run.
- Stop interrupts the live loop mid-run; the run row records `interrupted`.
- A model request that fails transiently (HTTP 429/5xx or a connection error) is retried automatically — up to 3 retries with roughly doubling delays capped at 60 s; stored waits resume after a restart instead of starting over, and stopping interrupts the wait. Other 4xx errors are never retried; exhausted retries fail the run with the provider's error text (usage from completed requests is kept). This policy is server-wide and cannot be configured.
- **Watchdog** — when set, a bot that has started no run for longer than its configured hours records one `watchdog` error run, shows Blocked, and sends one notification. Further scheduler ticks add nothing until a new run starts or the limit/enabled state changes; global pause freezes every watchdog clock, and a disabled bot resumes measuring from its next run after being enabled.
- **Global pause** — the Pause button in the status bar holds every bot at once (server-wide, any signed-in user). While paused nothing new starts: scheduled runs skip their current occurrence, webhook deliveries and Run-now requests are rejected, and chat sends wait until you resume ([trigger behavior](/triggers-scheduling#pausing)). A bot already mid-turn finishes it and goes quiet. The state survives a restart. When the spend circuit breaker trips — trailing-30-day token usage across every bot passing the server-wide cap set in Settings → General — it arms this pause, raises one notification, and refuses Resume with usage vs cap shown until you raise or clear the cap or the window rolls off.
- **Stop all** (panic button) sits beside the Pause toggle: after a confirm dialog it interrupts every running loop exactly like per-bot Stop and arms the global pause in the same action, so nothing instantly restarts. Pressing it with nothing running still pauses.
- If the server crashes or restarts mid-run, boot resumes runs whose durable work can continue; finished work is finalized from its committed transcript, while unresumable rows end with an error. No run stays stuck in `running`.
- **Restart machine** (confirmation required) interrupts any live run, then stops and removes the bot's container. The next shell use recreates it lazily from the currently selected machine image — handy after switching machines or a broken install. `/workspace` and history persist; anything installed outside it disappears.
- Deleting a bot removes its triggers and run history (confirmation required).

## Quick menu

Each card's ⋯ button opens per-bot actions without opening chat: **Open chat**, **Run now** (gating in [Lifecycle](#lifecycle)), **Stop** (listed only while running), **Settings**, **Clear memory** and **Delete** (both confirmed). The menu is keyboard reachable (arrows plus Home/End) and closes on selection, outside click or Escape; actions apply to that bot only.

## Scope and replies

The trigger or chat message that starts a run is the bot's assignment. Bots stay on that task, mention adjacent issues instead of chasing them, and stop when it is done or blocked. Progress goes to the task and status line; chat gets one reply per run, not a running commentary. Scheduled and webhook runs follow the same rule.

## Memory

Conversation context persists across runs and survives restarts; when it grows past the configured token budget, older turns are compacted into a summary automatically. Clear memory resets the loop's stored context.
