# Inbox — the attention view

- The sidebar's **Inbox** tab is the one place listing everything that needs a human; normal operation leaves it empty.
- Contents are derived live, never stored separately: runs blocked or errored awaiting attention, watchdog trips, breaker trips, pending tool approvals (`../tools/approvals.md`, when specced), and unread notifications (`../notifications/in-app.md`).
- Newest first, one row per item with kind icon, bot name where applicable, one-line detail and relative time; clicking routes via the notification target rules (`../notifications/in-app.md`) — run problems open that bot's chat with Logs expanded, breaker opens Settings → System.
- Items clear by resolving their source: reading the notification, a new successful run, raising the cap. There is no separate dismiss or delete — an item that would immediately reappear never leaves.
- The tab label carries a count badge of open items; at zero it shows none and the empty state reads "All clear" with the time of the last resolved item.
- The status-bar bell becomes a shortcut to `/inbox`; its badge mirrors the same count, and per-item mark-read stays available inside Inbox (`../notifications/in-app.md`).
- Filters (kind, bot) sit in the tab's action row; search does not index inbox items — sources are already searchable.
