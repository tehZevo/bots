# Bots dashboard

Single-page console for operating bots; any client that can reach the API may operate all bots.

- Bots tab (default view): a card per bot showing its name and status — `running` while its loop is active, otherwise `enabled` or `disabled`. Creating a bot adds a card; selecting a card opens that bot's detail view.
- Create a bot from the bots tab by name (optional system prompt).
- Detail actions: Run now, Enable/Disable, Clear memory, Delete; schedule triggers shown/editable per bot.
- Shows run history (status + output/error) or the stored transcript; refreshes by polling the API.
- Works on phones and desktops: single-column layout below tablet width — navigation moves behind a hamburger menu (see `navigation.md`), the open bot fills the screen, and controls are touch-sized. No horizontal scrolling at 360px wide.
- The server serves the built UI from its own origin; in dev Vite proxies `/api` → `:8787`.
