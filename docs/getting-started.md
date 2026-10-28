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

## Sign in

The API and UI are login-protected. Sessions live in an HttpOnly cookie for 7 days. Registration is off by default — start the container once with `ALLOW_REGISTRATION=true`, create your account, then remove it. Every signed-in user has equal access to all bots and settings; there is no admin tier. Settings → **General** holds self-service **Change password** (other sessions are logged out), while Settings → **System** shows the signed-in account and offers **Logout**. See [Accounts & access](/authentication) for API keys and browser-approved CLI sign-in.

## The console

Open the web UI (default `http://localhost:8075`). The status bar up top shows totals at a glance, opens [Search & commands](/search), carries the global **Pause/Resume** toggle that holds or releases every bot at once, and offers a **Stop all** panic button that interrupts every running bot and arms the pause in one confirmed action. The sidebar switches between **Bots**, **Teams**, **Roles**, **Machines**, **Integrations**, **Skills**, **Templates**, **Projects**, **Tags**, **Secrets** and **Settings**; each tab owns a URL (e.g. `/bots`, `/teams`), so links open it directly, reloads keep it, and Back/Forward walk between tabs. Inside Settings, the **General**, **Providers**, and **System** sections use query deep links (`?tab=providers`, `?tab=system`; General is `/settings`). The General section offers theme as one segmented control — `Light | Dark | System`; the choice applies instantly, persists per device, and **System** follows your OS preference live (dark when there is no saved choice).

1. **Configure a model first** — Settings → **Providers**: add an OpenAI-compatible provider (base URL + API key) and pick a default model. Replacing a saved API key asks you to confirm the rotation before saving; leave the field empty to keep the existing key. Bots without their own model use the default; with none configured they show **Blocked**.
2. **Add a bot** — "Add bot" suggests a random name (↻ reshuffles it). Instructions and role are optional.
3. **Run it** — press **Run now**, or add a trigger (cron / `@every 10m`, or a webhook) so the bot fires itself.
4. **Watch it work** — clicking a bot card opens its Chat sidebar; the gear in that sidebar opens General / Triggers / Logs tabs and actions. The colored dot on every card is its health level (table below); it pulses only while a run is active, each card independently.

## Back up configuration

Settings → **Configuration backup** exports bots, roles, skills with bundles, MCP servers, projects, tags, teams, templates, secret names/keys and API key hashes as one JSON file. Runs, chat history, usage totals, notifications, users, provider values, pause state, workspaces and avatars stay out of the snapshot.

Secret values are omitted by default; flip **Secret values in export** to `Included` only when you intend to carry them in the file. Restore parses and validates the entire upload before writing anything, then upserts each record by name without deleting records missing from the backup. New secrets whose values were not included are requested before the import completes, while existing values remain unchanged unless a value is supplied. Running bots keep their current loop and pick restored state up at their next run; see the [API reference](/api) for `/api/backup/config`.

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
- [CLI basics](/cli) — terminal access to the same REST API
- [Operations](/operations) — Docker socket security, runtime configuration, backup and restore
- [API](/api) — everything the UI can do, headless
