# Getting started

**bots** is a self-hosted orchestrator for LLM-driven bots. Each bot has a name, an optional system prompt and role, and runs on a schedule or on demand — with shell access in its own sandbox container, MCP tools it was granted, and full run history.

## The console

Open the web UI (default `http://localhost:8787`). The status bar up top shows totals at a glance; the sidebar switches between **Bots**, **Roles**, **Skills**, **Integrations** and **Settings**.

1. **Configure a model first** — Settings → LLM providers: add an OpenAI-compatible provider (base URL + API key) and pick a default model. Bots without their own model use the default; with none configured they show **Blocked**.
2. **Add a bot** — "Add bot" suggests a random name (↻ reshuffles it). System prompt and role are optional.
3. **Run it** — press **Run now**, or add a trigger (cron / `@every 10m`, or a webhook) so the bot fires itself.
4. **Watch it work** — open the bot for General / Triggers / Chat / Logs tabs. The colored dot on every card is its health level; every non-disabled dot pulses gently, out of sync (reduced-motion settings show steady dots).

## Health levels at a glance

| Dot | Meaning |
| --- | --- |
| 🟢 green | Active — loop running right now |
| 🔵 blue | Idle — enabled and ready, nothing to do |
| 🟡 yellow | Issues — the agent reported a concern |
| 🔴 red | Blocked — last run errored, no model, or the agent is stuck |
| ⚪ gray | Disabled — switched off; steady, nothing fires |

## Next steps

- [Bots](/bots) — detail tabs, enable/disable, chat, memory
- [Roles, skills & capabilities](/roles-capabilities-skills) — reusable instructions and granted tools
- [MCP integrations](/integrations-mcp) — external tool servers
- [Triggers & scheduling](/triggers-scheduling) — cron, `@every`, webhooks
- [API](/api) — everything the UI can do, headless
