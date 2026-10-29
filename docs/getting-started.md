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

All state lives under `$DATA_DIR` (default `/data`) as `bots.db` plus a `workspaces/` folder per bot. Mount that exact path from your compose file; mounting somewhere else is ignored and the image falls back to container-local storage, so data appears to survive even after you delete the host directory. See [Operations](/operations) for Docker socket security, runtime variables and backup guidance.

## The console

Open the web UI (default `http://localhost:8075`) and sign in — [Accounts & access](/authentication) covers sessions and creating the first account, while [Operations](/operations#runtime-configuration) explains the development seed. The status bar up top shows totals at a glance, opens [Search & commands](/search), carries **Pause**/**Resume** for every bot, and offers **Stop all** ([details](/bots#lifecycle)). The sidebar switches between **Bots**, **Teams**, **Roles**, **Machines**, **Integrations**, **Skills**, **Templates**, **Projects**, **Tags**, **Secrets** and **Settings**; each tab owns a URL (e.g. `/bots`, `/teams`), so links open it directly, reloads keep it, and Back/Forward walk between tabs. Inside Settings, the **General**, **Providers**, and **System** sections use query deep links (`?tab=providers`, `?tab=system`; General is `/settings`).

1. **Configure a model first** — Settings → **Providers**: add an OpenAI-compatible provider (base URL + API key) and pick a default model. Replacing a saved API key asks you to confirm the rotation before saving; leave the field empty to keep the existing key. Bots without their own model use the default; with none configured they show **Blocked**. For local development, enable the fake-provider setting described in [runtime configuration](/operations#runtime-configuration); Settings → **Providers** then shows a built-in read-only **Fake** provider you can set as the default without an API key. A plain fake-model message replies `FAKE OK (<bot name>)`; a message can also script replies, thinking, tool calls and failures with a directive only fake models parse:

   ```text
   [[fake]] {"reply":"Hello!","thinking":true,"tool_calls":[{"name":"shell","output":"done"}],"delay_ms":500} [[/fake]]
   Show the scripted tool and reply flow.
   ```

2. **Add a bot** — "Add bot" suggests a random name (↻ reshuffles it). Instructions and role are optional.
3. **Run it** — press **Run now**, or add a trigger (cron / `@every 10m`, or a webhook) so the bot fires itself.
4. **Watch it work** — clicking a bot card opens its Chat sidebar; the gear in that sidebar opens General / Triggers / Logs tabs and actions. Each card carries a health dot — meanings below.

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
- [Templates](/templates) — reusable bot bundles and starter triggers
- [Machines](/machines) — custom sandbox images bots can run in
- [MCP integrations](/integrations-mcp) — external tool servers
- [Triggers & scheduling](/triggers-scheduling) — cron, `@every`, webhooks
- [Secrets](/secrets) — environment variables for sandboxes and transcript redaction
- [PWA install](/pwa) — standalone app shell and offline behavior
- [CLI basics](/cli) — terminal access to bots, runs and triggers
- [Operations](/operations) — Docker socket security, runtime configuration, backup and restore
- [API](/api) — everything the UI can do, headless
