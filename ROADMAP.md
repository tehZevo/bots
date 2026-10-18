# Roadmap (planned specs)

Behaviors agreed on but not yet specced in detail. Each becomes its own spec directory when we open a PR for it.

- **Triggers & hooks** — external wake-ups: `POST /api/hooks/:id` with shared secret (GitHub push etc.), event payloads injected into the run prompt; new trigger kinds beyond `schedule`/`manual`.
- **Roles with capabilities** — roles grant access to MCP servers, skills, and plugins; a bot's capability set is resolved from its role instead of the fixed built-in tools.
- **Container customization** — per-bot images, extra packages, and resource limits beyond the single default sandbox image.
- **Chat messages** — send a message into a bot's context from the web UI; this surface replaces the removed "Run now" control.
- **Chat channels** — talk to bots interactively (web chat first, then external chat apps).
- **Approvals** — a human-approval layer for sensitive tool actions that the agent cannot bypass.
- **Auth & multi-user** — protect API/UI; per-user bots and credentials (placeholder tokens so models never see secrets).
- **Documented REST API + API keys** — the whole UI surface available headlessly over a documented REST API; per-user API keys created/revoked in Settings authenticate it.
- **MCP server for control** — orchestrator exposes an MCP server (list/create bots, set roles, fire runs, read logs) so external agents drive exactly what the UI can.
- **Bot avatars** — pick or generate an avatar per bot, shown on cards and the detail modal.
- **Random name shuffle** — a circular-arrows icon button beside the prefilled name in Add bot re-rolls another random name from the pool (see `web-ui/create-bot.md`).
- **Avatar animations** — status-driven avatar motion: disabled = still and gray, running = active animation, idle = sleeping animation (see web-ui/status-colors.md levels).
- **Current task** — bots publish what they are working on; the agent can update its current task/activity as it progresses, shown on cards and the detail modal.
- **PWA** — installable web app with offline shell and push-ready structure.
- **In-app notifications** — notification list for failed runs and pending approvals with an unread badge; delivered as native browser push through the PWA service worker once subscriptions exist.
- **Teams & groups** — organize bots and users into teams with shared visibility and ownership.
- **Yellow health state** — third-level color driven by the agent-reported `status` line (`bots/status-line.md`, `set_status` tool), not derived from run history.
