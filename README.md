# Bots

Self-hosted autonomous bots that run against any OpenAI-compatible LLM endpoint — scheduled, steerable, and sandboxed. Behavior is specced in `specs/`.

**Documentation:** https://tehzevo.github.io/bots/

## Features

- **Bots with persistent memory** — each bot keeps one growing conversation; long histories are summarized automatically. Clear it anytime (with confirmation).
- **Roles** — reusable system prompts assignable to bots; the effective prompt is the bot's own text plus its role's instructions.
- **Triggers** — run a message on cron expressions (`0 9 * * MON-FRI`) or intervals (`@every 30m`). Messages arriving while a bot is busy steer the active run instead of queueing.
- **Manual control** — Run now, Stop (interrupts a running loop mid-flight), enable/disable, per-bot run history with output and errors in a tabbed detail view.
- **Sandboxed tools** — `shell` runs bash inside the bot's own Docker container (only its workspace mounted at `/workspace`, no host env or secrets leak in); `web_fetch` does GET + HTML-to-text.
- **Search & filter** — find bots by name and status; search roles.
- **Clean UI** — light/dark/system themes, modals with keyboard/outside-tap handling, mobile-friendly layout.

## Run it

```bash
pnpm install
cp .env.example .env   # optional server settings
pnpm dev               # server on :8787, web UI on :5173 (pulls the sandbox image automatically)
```

`.env` values — LLM providers are configured in the UI (Settings → Providers), not env. Optional: `PORT` (default `8787`), `DATA_DIR` (default repo `data/`), `DATABASE_PATH`, `SANDBOX_IMAGE` (default `ghcr.io/tehzevo/bots-sandbox:latest`, pulled automatically).

Production — serves the built UI and API together on `:8787`:

```bash
pnpm build && pnpm start
```

### Published image (no local build)

Every merge to `master` publishes public orchestrator and sandbox images to GHCR (`ghcr.io/tehZevo/bots` and `ghcr.io/tehZevo/bots-sandbox`; `sha-<git-sha>` always, `latest` on successful master builds, semver git tags as version tags — the release line is `v0.x.y` until the first beta):

```bash
docker pull ghcr.io/tehZevo/bots:latest
```

```yaml
services:
  orchestrator:
    image: ghcr.io/tehZevo/bots:latest
    ports: ["8787:8787"]
    volumes:
      - ./data:/app/data
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

