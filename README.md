# Bots

Self-hosted autonomous bots: scheduled or manually triggered agents that run against any OpenAI-compatible LLM endpoint, with persistent per-bot memory and simple tools.

## Stack

- TypeScript end-to-end (Node 26+, pnpm workspaces)
- Server: [Hono](https://hono.dev) REST API + static UI serving, SQLite (`better-sqlite3`), cron scheduling (`cron-parser`)
- Agent loop: [`@earendil-works/pi-agent-core`](https://www.npmjs.com/package/@earendil-works/pi-agent-core) with OpenAI-compatible streaming via `@earendil-works/pi-ai`
- UI: React + Vite (dev proxy to the API)

## Quickstart

```bash
pnpm install
cp .env.example .env   # fill in your OpenAI-compatible endpoint
pnpm dev               # server on :8787, web on :5173
```

Required `.env` values:

| Variable       | Description                                  |
| -------------- | -------------------------------------------- |
| `LLM_BASE_URL` | OpenAI-compatible base URL (e.g. `https://host/v1`) |
| `LLM_API_KEY`  | API key                                      |
| `LLM_MODEL`    | Model id served by that endpoint             |

Optional: `PORT` (default `8787`), `DATA_DIR` (default repo `data/`), `DATABASE_PATH`.

For production: `pnpm build && pnpm start` serves the built UI and API from `:8787`.

## Concepts

- **Bot**: a named agent with an optional system prompt and model override. Its context is one persistent, forever-growing conversation (cleared only manually).
- **Trigger**: attaches to a bot and posts its message into that context on a schedule — cron expressions (`0 9 * * MON-FRI`) or intervals (`@every 30m`). Messages arriving while the bot is busy steer the active loop instead of queueing sessions.
- **Run**: one working cycle of the agent loop, from an injected trigger message until it goes quiet (manual or scheduled). Output and errors are stored.
- **Memory**: full conversation per bot persisted in SQLite; long histories are summarized/compacted automatically. Clear via UI or `DELETE /api/bots/:id/messages`.
- **Tools**: `web_fetch` (GET + HTML-to-text) and `shell` (bash in the bot's workspace under `data/workspaces/<bot-id>/`). Not sandboxed yet.

## API

| Method   | Path                       | Description                              |
| -------- | -------------------------- | ---------------------------------------- |
| GET      | `/api/health`              | Health check                             |
| GET      | `/api/bots`                | List bots                                |
| POST     | `/api/bots`                | Create bot (`name`, optional prompt)     |
| GET/PATCH/DELETE | `/api/bots/:id`  | Read/update/delete a bot                 |
| POST     | `/api/bots/:id/run`        | Inject manual message (202, may steer)   |
| GET      | `/api/bots/:id/runs`       | Run history                              |
| GET/POST | `/api/bots/:id/triggers`   | List / add schedule triggers             |
| PATCH/DELETE | `/api/triggers/:id`    | Update / delete a trigger                |
| GET      | `/api/bots/:id/messages`   | Conversation memory                      |
| DELETE   | `/api/bots/:id/messages`   | Clear memory                             |

## Roadmap

- Sandboxed computer use (containers) per bot workspace
- Hooks/triggers from the outside world (GitHub webhooks, chat apps)
- Roles composed of skills/plugins/MCP servers
- More tools (files, browser), tool permission policy per bot
