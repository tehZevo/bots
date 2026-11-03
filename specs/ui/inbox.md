# Inbox — the attention view

- The sidebar's **Inbox** tab is the one place listing everything that needs a human; normal operation leaves it empty.
- Contents are derived live, never stored separately: runs blocked or errored awaiting attention, watchdog trips, breaker trips, pending tool approvals (`../tools/approvals.md`, when specced), pending questions (`../tools/questions.md`), and unread notifications (`../notifications/in-app.md`).
- Newest first, one row per item with kind icon, bot name where applicable, one-line detail and relative time; clicking routes via the notification target rules (`../notifications/in-app.md`) — run problems open that bot's chat with Logs expanded, breaker opens Settings → System.
- Question rows answer inline — option buttons plus an optional Other field — and carry a chat button opening the bot's sidebar; answering goes through the question's own path rather than row-click navigation.
-  reading the notification, a new successful run, raising the cap. There is no separate dismiss or delete — an item that would immediately reappear never leaves.
- The tab label carries a count badge of open items; at zero it shows none and the empty state reads "All clear" with the time of the last resolved item.
- The status-bar bell becomes a shortcut to `/inbox`; its badge mirrors the same count, and per-item mark-read stays available inside Inbox (`../notifications/in-app.md`).
- Filters (kind, bot) sit in the tab's action row and are the shared multiselect (`../ui/multiselect.md`): kind is a fixed short list with no text filter, bot is searchable. A filter whose option list would be empty is not rendered, an open list scrolls inside its panel, and an open filter closes as soon as focus or a click lands outside it. Search does not index inbox items — sources are already searchable.
