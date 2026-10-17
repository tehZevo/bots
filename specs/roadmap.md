# Roadmap (planned specs)

Behaviors agreed on but not yet specced in detail. Each becomes its own spec directory when we open a PR for it.

- **Triggers & hooks** — external wake-ups: `POST /api/hooks/:id` with shared secret (GitHub push etc.), event payloads injected into the run prompt; new trigger kinds beyond `schedule`/`manual`.
- **Roles & skills** — a bot's capability set composed from skill bundles, agent plugins, and MCP servers instead of the fixed built-in tools.
- **Sandboxed computer use** — per-bot isolated execution (container/provider abstraction) replacing host `shell`.
- **Chat channels** — talk to bots interactively (web chat first, then external chat apps).
- **Approvals** — a human-approval layer for sensitive tool actions that the agent cannot bypass.
- **Auth & multi-user** — protect API/UI; per-user bots and credentials (placeholder tokens so models never see secrets).
