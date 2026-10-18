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

- **Docs site on GitHub Pages** — user-facing documentation under `docs/` (how to use the app, capabilities, API) published via Pages Actions (see `docs/github-pages.md`).

- **In-app notifications** — notification list for failed runs and pending approvals with an unread badge; delivered as native browser push through the PWA service worker once subscriptions exist.
- **External coding agents** — a bot can run a third-party headless CLI agent (opencode, Claude Code, …) inside its sandbox instead of the built-in pi loop: per-bot engine selection behind an adapter interface that spawns the CLI in print mode with JSON event streaming (`claude -p --output-format stream-json`, `opencode run --format json`) via container exec; role/system prompt bridged to the CLI's system-prompt flag, role MCP servers written as `.mcp.json`/config into `/workspace`; CLIs installed in the sandbox image with their provider keys injected as exec env.
