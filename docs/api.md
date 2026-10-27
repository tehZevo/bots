# API reference

Everything the UI does is available headlessly under `/api` (JSON), documented as OpenAPI 3.1 at [`/api/openapi.json`](/api/openapi.json).

## Authentication

Every route requires a session cookie (web UI login) or `Authorization: Bearer <api key>`; anything else answers `401 { error }`. Open exceptions: `/api/health`, the auth routes below, and webhook endpoints (`POST /api/webhooks/:triggerId`), which authenticate with their trigger secret instead. Cookie state changes are CSRF-guarded: same-origin `Origin` when present, JSON bodies otherwise.

Create keys in **Settings → System → API keys**: each value is `bots_` + 40 hex chars, shown exactly once and stored hashed; the list shows name, created-at and last-used (updated at most once per minute). Revoking fails closed — requests with a revoked or malformed key get `401 { "error": "invalid api key" }`. For UI key management, account setup and browser-approved CLI sign-in, see [Accounts & access](/authentication).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/auth/config` | `{ allow_registration, has_users }` — drives the sign-in screen |
| POST | `/api/auth/signup` | Create account — 403 unless `ALLOW_REGISTRATION=true`, weak password → 400, duplicate → 409; sets session cookie |
| POST | `/api/auth/login` | Email + password → session cookie (7 days); wrong credentials → 401 |
| GET | `/api/auth/me` | `{ email }` of the current caller — plus `key_id` when the request used an API key |
| POST | `/api/auth/logout` | Drop this session |
| POST | `/api/auth/password` | `{ current, new }` — 403 on wrong current; other sessions are invalidated |

## API keys

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/api-keys` | List `{ id, name, created_at, last_used_at }` — newest first |
| POST | `/api/api-keys` | Create — `{ name }`; response includes the one-time `value` |
| DELETE | `/api/api-keys/:keyId` | Revoke — 404 unknown id |

## Device login (browser-approved CLI access)

A terminal client requests a short code, the user approves it in the browser, and the client polls for a one-time API key (OAuth 2.0 device authorization, RFC 8628). Pending grants do not survive a server restart.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/device/code` | Public — `{ client_name }` → `{ device_code, user_code, verification_uri, verification_uri_complete, expires_in: 600, interval: 5 }`; rate-limited per IP |
| GET | `/api/auth/device/pending?user_code=` | Session — resolve a live code for the approval page → `{ client_name, key_name, expires_at }`; unknown/expired/consumed → 404 |
| POST | `/api/auth/device/approve` | Session + CSRF — `{ user_code, decision: "approve" \| "deny", key_name? }` → `{ ok: true }`; approval mints an API key named `bots-cli <client> <UTC date>` unless a name is given |
| POST | `/api/auth/device/token` | Public — poll with `{ device_code }`. Errors carry an OAuth code: `authorization_pending`, `slow_down`, `expired_token`, `access_denied`; the first success returns `{ api_key, key_id, key_name, email }` exactly once and the plaintext key is not retained after claim |

The approval page lives at `/device` (`verification_uri_complete` deep-links it with the code); it requires a login session, shows the client name and expiry before approval, and never displays the issued key.

## Bots

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/bots` | List bots incl. derived `health` (`green`/`blue`/`yellow`/`red`/`gray`) and `run_state` |
| POST | `/api/bots` | Create — `{ name, instructions?, model_id?, role_id? }` |
| GET/PATCH/DELETE | `/api/bots/:id` | Read / update fields incl. `enabled` / delete (cascades triggers + runs + notifications) |
| POST | `/api/bots/:id/run` | Run now — `{ message? }`, steers a live loop, returns `{ runId, steered }`; 409 while globally paused |
| POST | `/api/bots/:id/interrupt` | Stop the live loop |
| GET | `/api/bots/:id/runs` | Run history (status ok/error/interrupted, output, error) |
| GET | `/api/bots/:id/runs/:runId/transcript` | Replay for one run: `{ run, usage, steps }`; steps are chronological `user`/`assistant`/`tool_call` (args summary)/`tool_result` (persisted output, `duration_ms`, `is_error`) with `retry_wait_ms` where recorded; `steps: []` when no messages are linked to the run |
| GET | `/api/bots/:id/usage` | Token totals for the bot: `{ lifetime, last30d, budget }`; windows carry `input`, `output`, `cache_read`, `cache_write`, `total`, and `budget` is the trailing-30-day token cap (`null` = unlimited) |
| GET | `/api/bots/:id/context-usage` | Estimated context split: `{ context_window, categories: { system_prompt, tools, conversation }, used, free }`; `context_window`/`free` are `null` with no model configured |
| GET/POST | `/api/bots/:id/messages` | Chat history / inject a chat turn (steers or starts; while globally paused `{ runId: null, held: true }`) |
| DELETE | `/api/bots/:id/messages` | Clear stored context |

## Global pause

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/pause` | `{ paused, reason? }` — the server-wide pause state; `reason: "breaker"` while a tripped spend circuit breaker holds it |
| POST | `/api/pause` | `{ paused: bool }` — hold or resume every bot; anything injected while held drains on resume; Resume answers 409 with usage vs cap while the breaker is over its cap |
| POST | `/api/stop-all` | Panic button: interrupts every running loop and arms the pause — `{ stopped: <count> }`; idempotent (nothing running still pauses) |

## Spend circuit breaker

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/breaker` | `{ limit_tokens, tokens_30d, exceeded }` — the server-wide trailing-30-day cap and usage (`limit_tokens: 0` = unlimited) |
| PUT | `/api/breaker` | `{ limit_tokens: int ≥ 0 }` — set or clear (0) the cap; bringing it under usage re-arms resume — 400 on a non-integer or negative value |

The breaker is checked when a run reaches its terminal status; crossing the cap arms the global pause and raises one notification. See [Bots](/bots) and [Settings](/getting-started).

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

See [Templates](/templates) for the UI flow.

## Secrets

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/secrets` | List `{ id, name, key, created_at }` — values hidden |
| POST | `/api/secrets` | Create — `{ name, key, value }`; duplicate name or invalid env-var key → `400` |
| GET | `/api/secrets/:secretId` | Read metadata without the value |
| GET | `/api/secrets/:secretId/value` | Reveal the current plaintext value for an authorized action |
| PATCH | `/api/secrets/:secretId` | Update supplied fields; replacing `value` is destructive |
| DELETE | `/api/secrets/:secretId` | Remove — running sandboxes must restart to drop its variable |

Bots return their `secret_ids` in the bot API and accept updates through `PATCH /api/bots/:id`; teams support `secret_ids` on their PATCH route. See [Secrets](/secrets) for injection and redaction behavior.

## Control MCP (`/mcp`)

External agents drive the same surface over MCP at streamable HTTP `POST /mcp`, authenticated with an API key (`Authorization: Bearer bots_…`; session cookies don't apply). JSON-RPC methods: `initialize`, `tools/list`, `tools/call`. Tools are flat verbs whose results mirror the REST payloads exactly: `bots_list`, `bot_get`, `bot_create`, `bot_set_role`, `run_now`, `interrupt`, `runs_tail` (accepts `limit`, max 100). A **Settings → System → Control MCP** switch enables the endpoint; while disabled `/mcp` returns `404`. Unknown or revoked keys are rejected with `401` before any JSON-RPC method runs.

## Notifications

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/notifications` | `{ items, unread_count }`, newest first; `?limit=` 1–250 (default 100) |
| POST | `/api/notifications/:id/read` | Mark one read — 404 unknown id |
| POST | `/api/notifications/read-all` | Mark everything read |

Created automatically when a run ends `error` (deduped per run). See [Notifications](/notifications).

## Roles, skills & MCP servers

CRUD on `/api/roles`, `/api/skills`, `/api/mcp-servers`. Roles accept `instructions` plus capability grants `mcp_server_ids: []` and `skill_ids: []`; unknown ids → `400`. Skills require `name` + `instructions`; MCP servers require unique `name`, non-empty `command`, optional `args[]`, and `env{}` whose values are either literal strings or `{ "secret": "<managed secret name>" }` references (unknown or deleted names → `400`); `POST /api/mcp-servers/:id/test` runs the handshake.

Skill import (never writes until confirmed): `GET /api/skills/search?q=` proxies skills.sh candidates, `POST /api/skills/preview` resolves a source (`owner/repo`, repo URL with optional `/tree/<ref>/<path>`, `@<skill>` filter, `#<ref>` pin) into per-`SKILL.md` previews with commit, file count, size and content hash, and `POST /api/skills/import { source, folders[] }` stores the selected bundles byte-for-byte plus immutable provenance (`import_info` on the skill row) — rejecting unreachable sources, oversized bundles (>200 files or >5 MB) and invalid frontmatter with nothing saved.

## Webhooks

`POST /api/webhooks/:triggerId` with `Authorization: Bearer <secret>` — 401 bad token, 409 trigger/bot disabled or globally paused, 413 payload over 64 KB.
