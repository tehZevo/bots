# API reference

Everything the UI does is available headlessly under `/api` (JSON), documented as OpenAPI 3.1 at [`/api/openapi.json`](/api/openapi.json).

## Authentication

Every route requires a session cookie (web UI login) or `Authorization: Bearer <api key>`; anything else answers `401 { error }`. Open exceptions: `/api/health`, the auth routes below, and webhook endpoints (`POST /api/webhooks/:triggerId`), which authenticate with their trigger secret instead. Cookie state changes are CSRF-guarded: same-origin `Origin` when present, JSON bodies otherwise.

Create keys in **Settings → API keys**: each value is `bots_` + 40 hex chars, shown exactly once and stored hashed; the list shows name, created-at and last-used (updated at most once per minute). Revoking fails closed — requests with a revoked or malformed key get `401 { "error": "invalid api key" }`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/auth/config` | `{ allow_registration, has_users }` — drives the sign-in screen |
| POST | `/api/auth/signup` | Create account — 403 unless `ALLOW_REGISTRATION=true`, weak password → 400, duplicate → 409; sets session cookie |
| POST | `/api/auth/login` | Email + password → session cookie (7 days); wrong credentials → 401 |
| GET | `/api/auth/me` | `{ email }` of the current caller |
| POST | `/api/auth/logout` | Drop this session |
| POST | `/api/auth/password` | `{ current, new }` — 403 on wrong current; other sessions are invalidated |

## API keys

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/api-keys` | List `{ id, name, created_at, last_used_at }` — newest first |
| POST | `/api/api-keys` | Create — `{ name }`; response includes the one-time `value` |
| DELETE | `/api/api-keys/:keyId` | Revoke — 404 unknown id |

## Bots

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/bots` | List bots incl. derived `health` (`green`/`blue`/`yellow`/`red`/`gray`) and `run_state` |
| POST | `/api/bots` | Create — `{ name, instructions?, model_id?, role_id? }` |
| GET/PATCH/DELETE | `/api/bots/:id` | Read / update fields incl. `enabled` / delete (cascades triggers + runs + notifications) |
| POST | `/api/bots/:id/run` | Run now — `{ message? }`, steers a live loop, returns `{ runId, steered }`; 409 while globally paused |
| POST | `/api/bots/:id/interrupt` | Stop the live loop |
| GET | `/api/bots/:id/runs` | Run history (status ok/error/interrupted, output, error) |
| GET | `/api/bots/:id/usage` | Token totals for the bot: `{ lifetime, last30d, budget }`; windows carry `input`, `output`, `cache_read`, `cache_write`, `total`, and `budget` is the trailing-30-day token cap (`null` = unlimited) |
| GET | `/api/bots/:id/context-usage` | Estimated context split: `{ context_window, categories: { system_prompt, tools, conversation }, used, free }`; `context_window`/`free` are `null` with no model configured |
| GET/POST | `/api/bots/:id/messages` | Chat history / inject a chat turn (steers or starts; while globally paused `{ runId: null, held: true }`) |
| DELETE | `/api/bots/:id/messages` | Clear stored context |

## Global pause

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/pause` | `{ paused }` — the server-wide pause state |
| POST | `/api/pause` | `{ paused: bool }` — hold or resume every bot; anything injected while held drains on resume |

## Triggers

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/bots/:id/triggers` | List / create — `{ kind: "schedule"\|"webhook", message, schedule? }`; webhook responses include the secret once |
| PATCH | `/api/triggers/:id` | Update `message`, `schedule`, or `enabled` (bool; resume never catch-up-fires) |
| DELETE | `/api/triggers/:id` | Remove |
| POST | `/api/triggers/:id/rotate-secret` | New webhook secret (destructive — invalidates the old one immediately) |

## Templates

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/templates` | List reusable bundles — newest first |
| POST | `/api/templates` | Create — `{ name, description?, instructions?, machine_id?, role_id?, triggers?: [{ message, schedule }] }`; unknown refs / bad schedules → `400`, duplicate name → `409` |
| PATCH | `/api/templates/:id` | Partial update (same validation) |
| DELETE | `/api/templates/:id` | Delete — bots created from it are untouched |

See [Bots → Templates](/bots#templates) for the UI flow.

## Control MCP (`/mcp`)

External agents drive the same surface over MCP at streamable HTTP `POST /mcp`, authenticated with an API key (`Authorization: Bearer bots_…`; session cookies don't apply). JSON-RPC methods: `initialize`, `tools/list`, `tools/call`. Tools are flat verbs whose results mirror the REST payloads exactly: `bots_list`, `bot_get`, `bot_create`, `bot_set_role`, `run_now`, `interrupt`, `runs_tail` (accepts `limit`, max 100). A **Settings → Control MCP** switch enables the endpoint; while disabled `/mcp` returns `404`.

## Notifications

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/notifications` | `{ items, unread_count }`, newest first; `?limit=` 1–250 (default 100) |
| POST | `/api/notifications/:id/read` | Mark one read — 404 unknown id |
| POST | `/api/notifications/read-all` | Mark everything read |

Created automatically when a run ends `error` (deduped per run). See [Notifications](/notifications).

## Roles, skills & MCP servers

CRUD on `/api/roles`, `/api/skills`, `/api/mcp-servers`. Roles accept `instructions` plus capability grants `mcp_server_ids: []` and `skill_ids: []`; unknown ids → `400`. Skills require `name` + `instructions`; MCP servers require unique `name`, non-empty `command`, optional `args[]`, `env{}`; `POST /api/mcp-servers/:id/test` runs the handshake.

## Webhooks

`POST /api/webhooks/:triggerId` with `Authorization: Bearer <secret>` — 401 bad token, 409 trigger/bot disabled or globally paused, 413 payload over 64 KB.
