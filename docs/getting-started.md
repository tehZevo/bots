# Getting started

**bots** is a self-hosted orchestrator for LLM-driven bots. Each bot has a name, optional instructions and a role, and runs on a schedule or on demand — with shell access in its own sandbox container (bash, git, GitHub CLI, and curl), MCP tools it was granted, and full run history.

## Running in Docker

```yaml
services:
  orchestrator:
    image: ghcr.io/tehzevo/bots:latest
    ports: ["8075:8075"]
    volumes:
      - ./data:/data            # database + bot workspaces — must be /data (DATA_DIR)
      - /var/run/docker.sock:/var/run/docker.sock   # to manage sandbox containers
```

All state lives under `$DATA_DIR` (default `/data`) as `bots.db` plus a `workspaces/` folder per bot. Mount that exact path from your compose file; mounting somewhere else is ignored and the image falls back to container-local storage, so data appears to survive even after you delete the host directory.

## Sign in

The API and UI are login-protected. Sessions live in an HttpOnly cookie for 7 days. Registration is off by default — start the container once with `ALLOW_REGISTRATION=true`, create your account, then remove it. Every signed-in user has equal access to all bots and settings; there is no admin tier. Settings holds self-service **Change password** (other sessions are logged out) and **Logout**.

## The console

Open the web UI (default `http://localhost:8075`). The status bar up top shows totals at a glance and carries the global **Pause/Resume** toggle that holds or releases every bot at once and a **Stop all** panic button that interrupts every running bot and arms the pause in one confirmed action. The sidebar switches between **Bots**, **Teams**, **Roles**, **Machines**, **Integrations**, **Skills**, **Templates**, **Projects**, **Tags** and **Settings**; each tab owns a URL (e.g. `/bots`, `/teams`), so links open it directly, reloads keep it, and Back/Forward walk between tabs. Settings offers the theme as one segmented control — `Light | Dark | System`; the choice applies instantly, persists per device, and **System** follows your OS preference live (dark when there is no saved choice).

1. **Configure a model first** — Settings → LLM providers: add an OpenAI-compatible provider (base URL + API key) and pick a default model. Replacing a saved API key asks you to confirm the rotation before saving; leave the field empty to keep the existing key. Bots without their own model use the default; with none configured they show **Blocked**.
2. **Add a bot** — "Add bot" suggests a random name (↻ reshuffles it). Instructions and role are optional.
3. **Run it** — press **Run now**, or add a trigger (cron / `@every 10m`, or a webhook) so the bot fires itself.
4. **Watch it work** — clicking a bot card opens its Chat sidebar; the gear in that sidebar opens General / Triggers / Logs tabs and actions. The colored dot on every card is its health level (table below); it pulses only while a run is active, each card independently.

## Health levels at a glance

| Dot | Meaning |
| --- | --- |
| 🟢 green | Active — loop running right now |
| 🔵 blue | Idle — enabled and ready, nothing to do |
| 🟡 yellow | Issues — the agent reported a concern |
| 🔴 red | Blocked — last run errored, no model, or the agent is stuck |
| ⚪ gray | Disabled — switched off; nothing fires |

## Next steps

- [Bots](/bots) — detail tabs, enable/disable, chat, memory
- [Roles, skills & capabilities](/roles-capabilities-skills) — reusable instructions and granted tools
- [Machines](/machines) — custom sandbox images bots can run in
- [MCP integrations](/integrations-mcp) — external tool servers
- [Triggers & scheduling](/triggers-scheduling) — cron, `@every`, webhooks
- [API](/api) — everything the UI can do, headless
