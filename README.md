# Bots

Self-hosted autonomous bots: scheduled or manually triggered agents that run against any OpenAI-compatible LLM endpoint, with persistent per-bot memory, roles, and sandboxed tools. Behavior is specced in `specs/`.

## Stack

- TypeScript end-to-end (Node 26+, pnpm workspaces)
- Server: [Hono](https://hono.dev) REST API + static UI serving, SQLite (`better-sqlite3`), cron scheduling (`cron-parser`)
- Agent loop: [`@earendil-works/pi-agent-core`](https://www.npmjs.com/package/@earendil-works/pi-agent-core) with OpenAI-compatible streaming via `@earendil-works/pi-ai`
- UI: React + Vite (dev proxy to the API), light/dark/system themes

## Quickstart

```bash
pnpm install
cp .env.example .env   # fill in your OpenAI-compatible endpoint
docker build -t bots-sandbox:latest docker/sandbox   # bot shell sandbox image
pnpm dev               # server on :8787, web on :5173
```

Required `.env` values:

| Variable       | Description                                  |
| -------------- | -------------------------------------------- |
| `LLM_BASE_URL` | OpenAI-compatible base URL (e.g. `https://host/v1`) |
| `LLM_API_KEY`  | API key                                      |
| `LLM_MODEL`    | Model id served by that endpoint             |

Optional: `PORT` (default `8787`), `DATA_DIR` (default repo `data/`), `DATABASE_PATH`, `SANDBOX_IMAGE` (default `bots-sandbox:latest`).

For production: `pnpm build && pnpm start` serves the built UI and API from `:8787`.

## Concepts

- **Bot**: a named agent with an optional system prompt, model override, and assigned role. Its context is one persistent conversation (cleared manually, with confirmation).
- **Role**: reusable instruction text assignable to bots; the effective system prompt is the bot's own prompt plus its role's instructions. Managed from the Roles tab (search + modals).
- **Trigger**: attaches to a bot and posts its message into that context on a schedule — cron expressions (`0 9 * * MON-FRI`) or intervals (`@every 30m`). Messages arriving while the bot is busy steer the active loop instead of queueing sessions.
- **Run**: one working cycle of the agent loop, from an injected trigger message until it goes quiet (manual or scheduled). Output and errors are stored; a running loop can be interrupted (**Stop**) — the run lands as `error: interrupted`.
- **Memory**: full conversation per bot persisted in SQLite; long histories are summarized/compacted automatically. Clear via UI or API.
- **Sandbox**: one Docker container per bot (`bots-bot-<id>`), created lazily on first shell use, reused across runs and restarts. Only the bot's workspace is mounted at `/workspace`; no host env/secrets leak in; outbound network allowed.
- **Tools**: `web_fetch` (GET + HTML-to-text) and `shell` (bash inside the bot's container). Destructive UI actions ask for confirmation.

## Development

```bash
pnpm -r typecheck                 # must pass before committing
pnpm exec biome check --write .   # lint/format
```

Specs in `specs/` are the source of truth; spec-only PRs first, implementation in separate PRs referencing them (see `AGENTS.md`).

## Roadmap

- Hooks/triggers from the outside world (GitHub webhooks, chat apps)
- Roles composed of skills/plugins/MCP servers instead of fixed built-in tools
- Chat channels to talk to bots interactively
- Approvals for sensitive tool actions; auth & multi-user
