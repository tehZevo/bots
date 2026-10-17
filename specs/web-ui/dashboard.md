# Bots dashboard

Single-page console for operating bots; any client that can reach the API may operate all bots.

- Sidebar: create bots (name, task, cron, optional system prompt), select one to open it.
- Detail actions: Run now, Enable/Disable, Clear memory, Delete.
- Shows run history (status + output/error) or the stored transcript; refreshes by polling the API.
- The server serves the built UI from its own origin; in dev Vite proxies `/api` → `:8787`.
