# Roadmap (planned specs)

Behaviors agreed on but not yet specced in detail. Each becomes its own spec directory when we open a PR for it.

- **External chat services** — external chat platforms (Slack, Discord, Telegram, …) as trigger sources with reply delivery; web chat is already specced in `web-ui/chat-messages.md`.
- **Approvals** — a human-approval layer for sensitive tool actions that the agent cannot bypass.
- **Team DM reply storms** — guard bot↔bot `send_message` loops (depth cap or similar); currently mitigated only because nothing auto-replies and injections merge into active loops.
- **Auth & multi-user** — protect API/UI; per-user bots and credentials (placeholder tokens so models never see secrets).
- **CLI** — first-class command-line client (`bots <verb>`) driving the documented REST API with the same API keys: bot CRUD, run now/interrupt, trigger management, logs tail, template instantiation; scriptable output (`--json`) for cron/CI use.

- **External coding agents** — a bot can run a third-party headless CLI agent (opencode, Claude Code, …) inside its sandbox instead of the built-in pi loop: per-bot engine selection behind an adapter interface that spawns the CLI in print mode with JSON event streaming (`claude -p --output-format stream-json`, `opencode run --format json`) via container exec; role/system prompt bridged to the CLI's system-prompt flag, role MCP servers written as `.mcp.json`/config into `/workspace`; CLIs installed in the sandbox image with their provider keys injected as exec env.
