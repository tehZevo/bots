# Roadmap (planned specs)

Behaviors agreed on but not yet specced in detail. Each becomes its own spec directory when we open a PR for it.

- **External chat services** — external chat platforms (Slack, Discord, Telegram, …) as trigger sources with reply delivery; web chat is already specced in `specs/chat/messages.md`.
- **Approvals** — a human-approval layer for sensitive tool actions that the agent cannot bypass.
- **Team DM reply storms** — guard bot↔bot `send_message` loops (depth cap or similar); currently mitigated only because nothing auto-replies and injections merge into active loops.
- **Per-user ownership** — per-user bots, teams and credentials on top of the shared multi-user accounts (`auth/multi-user.md`); placeholder tokens so models never see secrets.
- **CLI** — first-class command-line client (`bots <verb>`) driving the documented REST API with the same API keys: bot CRUD, run now/interrupt, trigger management, logs tail, template instantiation; scriptable output (`--json`) for cron/CI use.

- **Panic button** — emergency stop/interrupt for all running bots.

- **Installable skills — skills.sh** — discover and install skills from the skills.sh registry.
- **Installable skills — git repo** — install a skill from a git repository URL.
