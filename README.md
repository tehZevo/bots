# Bots

Self-hosted autonomous bots that run against any OpenAI-compatible LLM endpoint — scheduled, steerable, and sandboxed. Behavior is specced in `specs/`.

**Documentation:** https://tehzevo.github.io/bots/

## Features

- **Bots with persistent memory** — each bot keeps one growing conversation; long histories are summarized automatically, and you can clear it anytime.
- **Roles & capabilities** — reusable instructions plus granted skills and MCP tools; the effective prompt is the bot's own text plus its role's instructions and grants.
- **Triggers** — run a message on cron expressions (`0 9 * * MON-FRI`) or intervals (`@every 30m`), or via webhook URLs with bearer secrets. Messages arriving while a bot is busy steer the active run instead of queueing.
- **Manual control** — Run now, Stop (interrupts a running loop mid-flight), global pause, enable/disable, per-bot run history with output and errors in a tabbed detail view.
- **Sandboxed tools** — `shell` runs bash inside the bot's own Docker container (only its workspace mounted at `/workspace`, no host env or secrets leak in); `web_fetch` does GET + HTML-to-text. Custom sandbox images ("machines") build from per-machine Dockerfiles.
- **Teams, projects & tags** — group bots with leader designation and bot-to-bot DMs; attach shared markdown context to any number of bots; label and filter freely.
- **Search & filter** — find bots by name, status, role, or tag; search roles.
- **Clean UI** — light/dark/system themes, modals with keyboard/outside-tap handling, mobile-friendly layout.

## Run it

```bash
pnpm install
cp .env.example .env   # optional server settings
pnpm dev               # server on :8075, web UI on :5173 (pulls the sandbox image automatically)
```

`.env` values — LLM providers are configured in the UI (Settings → Providers), not env. Optional: `PORT` (default `8075`), `DATA_DIR` (default repo `data/`), `DATABASE_PATH`, `SANDBOX_IMAGE` (default `ghcr.io/tehzevo/bots-sandbox:latest`, pulled automatically).

Production — serves the built UI and API together on `:8075`:

```bash
pnpm build && pnpm start
```

### Published image (no local build)

Every merge to `master` publishes public orchestrator and sandbox images to GHCR (`ghcr.io/tehzevo/bots` and `ghcr.io/tehzevo/bots-sandbox`; `sha-<git-sha>` always, `latest` on successful master builds, semver git tags as version tags — the release line is `v0.x.y` until the first beta):

```bash
docker pull ghcr.io/tehzevo/bots:latest
```

```yaml
services:
  orchestrator:
    image: ghcr.io/tehzevo/bots:latest
    ports: ["8075:8075"]
    volumes:
      - ./data:/data            # must be /data (DATA_DIR)
      - /var/run/docker.sock:/var/run/docker.sock
    # SANDBOX_IMAGE only needed to point at a custom sandbox build
```

The orchestrator shells out to the host Docker daemon for bot sandboxes, so the socket must be mounted; it pulls `ghcr.io/tehzevo/bots-sandbox:latest` automatically before a bot's first shell command.

## Development

```bash
pnpm -r typecheck                 # must pass before committing
pnpm exec biome check --write .   # lint/format
```

Specs in `specs/` are the source of truth; spec-only PRs first, implementation in separate PRs referencing them (see `AGENTS.md`).

## Roadmap

See [ROADMAP.md](ROADMAP.md).

