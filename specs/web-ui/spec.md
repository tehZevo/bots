# Web UI

Minimal single-page console for operating bots. No auth yet.

- Sidebar: create bots (name, task, cron, optional system prompt), pick one to open.
- Detail actions: Run now, Enable/Disable, Clear memory, Delete.
- Shows run history (status + output/error) or the stored transcript; polling only, no live streaming yet.
- Prod: server serves the built UI; dev: Vite proxies `/api` → `:8787`.
