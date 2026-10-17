# Roadmap (planned specs)

Behaviors agreed on but not yet specced in detail. Each becomes its own spec directory when we open a PR for it.

- **Triggers & hooks** — external wake-ups: `POST /api/hooks/:id` with shared secret (GitHub push etc.), event payloads injected into the run prompt; new trigger kinds beyond `schedule`/`manual`.
- **Roles & skills** — a bot's capability set composed from skill bundles, agent plugins, and MCP servers instead of the fixed built-in tools.
- **Container customization** — per-bot images, extra packages, and resource limits beyond the single default sandbox image.
- **Dockerizing Bots** — ship the bots service and UI themselves as a container image / compose setup.
- **Chat messages** — send a message into a bot's context from the web UI; this surface replaces the removed "Run now" control.
- **Chat channels** — talk to bots interactively (web chat first, then external chat apps).
- **Approvals** — a human-approval layer for sensitive tool actions that the agent cannot bypass.
- **Auth & multi-user** — protect API/UI; per-user bots and credentials (placeholder tokens so models never see secrets).
- **Bot avatars** — pick or generate an avatar per bot, shown on cards and the detail modal.
- **Current task** — bots publish what they are working on; the agent can update its current task/activity as it progresses, shown on cards and the detail modal.
- **PWA** — installable web app with offline shell and push-ready structure.
- **Teams & groups** — organize bots and users into teams with shared visibility and ownership.
- **Health statuses** — extend bot status colors: yellow = issues detected, red = error/blocked.
