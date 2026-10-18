# API reference

Everything the UI does is available headlessly under `/api` (JSON). Today the API is unauthenticated on a trusted network; per-user API keys are [planned](https://github.com/tehZevo/bots/blob/master/ROADMAP.md).

## Bots

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/bots` | List bots incl. derived `health` (`green`/`blue`/`yellow`/`red`/`gray`) and `run_state` |
| POST | `/api/bots` | Create — `{ name, description?, system_prompt?, model_id?, role_id? }` |
| GET/PATCH/DELETE | `/api/bots/:id` | Read / update fields incl. `enabled` / delete (cascades triggers + runs) |
| POST | `/api/bots/:id/run` | Run now — `{ message? }`, steers a live loop, returns `{ runId, steered }` |
| POST | `/api/bots/:id/interrupt` | Stop the live loop |
| GET | `/api/bots/:id/runs` | Run history (status ok/error/interrupted, output, error) |
| GET/POST | `/api/bots/:id/messages` | Chat history / inject a chat turn (202; steers or starts) |
| DELETE | `/api/bots/:id/messages` | Clear stored context |

## Triggers

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/bots/:id/triggers` | List / create — `{ kind: "schedule"\|"webhook", message, schedule? }`; webhook responses include the secret once |
| PATCH | `/api/triggers/:id` | Update `message`, `schedule`, or `enabled` (bool; resume never catch-up-fires) |
| DELETE | `/api/triggers/:id` | Remove |
| POST | `/api/triggers/:id/rotate-secret` | New webhook secret (destructive — invalidates the old one immediately) |

## Roles, skills & MCP servers

CRUD on `/api/roles`, `/api/skills`, `/api/mcp-servers`. Roles accept `instructions` plus capability grants `mcp_server_ids: []` and `skill_ids: []`; unknown ids → `400`. Skills require `name` + `instructions`; MCP servers require unique `name`, non-empty `command`, optional `args[]`, `env{}`; `POST /api/mcp-servers/:id/test` runs the handshake.

## Webhooks

`POST /api/webhooks/:triggerId` with `Authorization: Bearer <secret>` — 401 bad token, 409 trigger/bot disabled, 413 payload over 64 KB.
