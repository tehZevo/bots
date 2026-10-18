# Roadmap (planned specs)

Behaviors agreed on but not yet specced in detail. Each becomes its own spec directory when we open a PR for it.

- **Chat channels** — talk to bots interactively (web chat first, then external chat apps).
- **Approvals** — a human-approval layer for sensitive tool actions that the agent cannot bypass.
- **Auth & multi-user** — protect API/UI; per-user bots and credentials (placeholder tokens so models never see secrets).
- **CLI** — first-class command-line client (`bots <verb>`) driving the documented REST API with the same API keys: bot CRUD, run now/interrupt, trigger management, logs tail, template instantiation; scriptable output (`--json`) for cron/CI use.

- **Documented REST API + API keys** — the whole UI surface available headlessly over a documented REST API; per-user API keys created/revoked in Settings authenticate it.
- **MCP server for control** — orchestrator exposes an MCP server (list/create bots, set roles, fire runs, read logs) so external agents drive exactly what the UI can.
- **Random name shuffle** — a circular-arrows icon button beside the prefilled name in Add bot re-rolls another random name from the pool (see `web-ui/create-bot.md`).
- **Avatar animations** — status-driven avatar motion: disabled = still and gray, running = active animation, idle = sleeping animation (see web-ui/status-colors.md levels).
- **Bot templates** — reusable bundles of machine + role (+ description, system prompt, starter triggers) created from any bot or from scratch; "New bot from template" pre-fills the create dialog and can be instantiated repeatedly.

- **In-app notifications** — notification list for failed runs and pending approvals with an unread badge; delivered as native browser push through the PWA service worker once subscriptions exist.
