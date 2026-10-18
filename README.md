# Bots

Self-hosted autonomous bots that run against any OpenAI-compatible LLM endpoint — scheduled, steerable, and sandboxed. Behavior is specced in `specs/`.

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
cp .env.example .env   # fill in your OpenAI-compatible endpoint
docker build -t bots-sandbox:latest docker/sandbox   # image for bot shells
pnpm dev               # server on :8787, web UI on :5173
```

`.env` values:

| Variable       | Description                                          |
| -------------- | ---------------------------------------------------- |
| `LLM_BASE_URL` | OpenAI-compatible base URL (e.g. `https://host/v1`)  |
| `LLM_API_KEY`  | API key                                              |
| `LLM_MODEL`    | Model id served by that endpoint                     |

Optional: `PORT` (default `8787`), `DATA_DIR` (default repo `data/`), `DATABASE_PATH`, `SANDBOX_IMAGE` (default `bots-sandbox:latest`).

Production — serves the built UI and API together on `:8787`:

```bash
pnpm build && pnpm start
```

## Development

```bash
pnpm -r typecheck                 # must pass before committing
pnpm exec biome check --write .   # lint/format
```

Specs in `specs/` are the source of truth; spec-only PRs first, implementation in separate PRs referencing them (see `AGENTS.md`).

## Roadmap

- **Triggers & hooks** — external wake-ups: `POST /api/hooks/:id` with shared secret (GitHub push etc.), event payloads injected into the run prompt; new trigger kinds beyond `schedule`/`manual`.
- **Roles with capabilities** — roles grant access to MCP servers, skills, and plugins; a bot's capability set is resolved from its role instead of the fixed built-in tools.
- **Container customization** — per-bot images, extra packages, and resource limits beyond the single default sandbox image.
- **Chat messages** — send a message into a bot's context from the web UI; this surface replaces the removed "Run now" control.
- **Chat channels** — talk to bots interactively (web chat first, then external chat apps).
- **Approvals** — a human-approval layer for sensitive tool actions that the agent cannot bypass.
- **Auth & multi-user** — protect API/UI; per-user bots and credentials (placeholder tokens so models never see secrets).
- **Bot avatars** — pick or generate an avatar per bot, shown on cards and the detail modal.
- **Current task** — bots publish what they are working on; the agent can update its current task/activity as it progresses, shown on cards and the detail modal.
- **PWA** — installable web app with offline shell and push-ready structure.
- **Teams & groups** — organize bots and users into teams with shared visibility and ownership.
- **Health statuses** — extend bot status colors: yellow = issues detected, red = error/blocked.
