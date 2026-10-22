# Roadmap (planned specs)

Behaviors agreed on but not yet specced in detail. Each becomes its own spec directory when we open a PR for it.

- **External chat services** — external chat platforms (Slack, Discord, Telegram, …) as trigger sources with reply delivery; web chat is already specced in `specs/chat/messages.md`.
- **Approvals** — a human-approval layer for sensitive tool actions that the agent cannot bypass.
- **Durable agent harness** — explore `@earendil-works/pi-durable` (or a similar durable runtime) as the agent loop: conversations, model turns and tool calls are committed to storage before display, so a process death mid-turn resumes where it stopped instead of losing the turn; still experimental upstream, so evaluate the API churn and whether it replaces or wraps the current pi loop.
- **Team DM reply storms** — guard bot↔bot `send_message` loops (depth cap or similar); currently mitigated only because nothing auto-replies and injections merge into active loops.
- **Per-user ownership** — per-user bots, teams and credentials on top of the shared multi-user accounts (`auth/multi-user.md`); placeholder tokens so models never see secrets.
- **CLI** — first-class command-line client (`bots <verb>`) driving the documented REST API with the same API keys: bot CRUD, run now/interrupt, trigger management, logs tail, template instantiation; scriptable output (`--json`) for cron/CI use.
- **External coding agents** — a bot can run a third-party headless CLI agent (opencode, Claude Code, …) inside its sandbox instead of the built-in pi loop: per-bot engine selection behind an adapter interface that spawns the CLI in print mode with JSON event streaming (`claude -p --output-format stream-json`, `opencode run --format json`) via container exec; role/system prompt bridged to the CLI's system-prompt flag, role MCP servers written as `.mcp.json`/config into `/workspace`; CLIs installed in the sandbox image with their provider keys injected as exec env.

- **Panic button** — emergency stop/interrupt for all running bots.

- **Installable skills — skills.sh** — discover and install skills from the skills.sh registry.
- **Installable skills — git repo** — install a skill from a git repository URL.
- **Electron app** — desktop wrapper around the web UI: pick a server, keep bots visible via tray icon and native notifications; reuses the REST API and browser push conventions of the PWA.
