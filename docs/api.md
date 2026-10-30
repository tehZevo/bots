# API reference

Everything the UI does is available headlessly under `/api` (JSON), documented as OpenAPI 3.1 at [`/api/openapi.json`](/api/openapi.json).

## Authentication

Every route requires a session cookie (web UI login) or `Authorization: Bearer <api key>`; anything else answers `401 { error }`. Open exceptions: `/api/health`, the auth routes below, and webhook endpoints (`POST /api/webhooks/:triggerId`), which authenticate with their trigger secret instead. Cookie state changes are CSRF-guarded: same-origin `Origin` when present, JSON bodies otherwise.

Key management is session-only — see [Accounts & access](/authentication) for the UI flow, including one-time display and revocation. `GET /api/api-keys`, `POST /api/api-keys` and `DELETE /api/api-keys/:keyId` reject Bearer requests with `403 { "error": "session authentication required" }`, so a stolen key can neither mint replacement keys nor enumerate or revoke the owner's others. The list shows name, created-at and last-used (updated at most once per minute); a request with a revoked or malformed key gets `401 { "error": "invalid api key" }`.

Public auth endpoints are rate-limited in process memory with `429 { "error": "rate_limited" }`: login/signup allow 10 failed credential attempts per client IP per 15 minutes (successes reset the count), and public auth routes cap each IP at 300 requests/min. Client IP comes from the socket address or, when trusted-proxy mode is enabled, the first `X-Forwarded-For` hop ([runtime configuration](/operations#runtime-configuration)). Webhook delivery budgets are listed under [Webhooks](#webhooks).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/auth/config` | `{ allow_registration, has_users }` — drives the sign-in screen |
| POST | `/api/auth/signup` | Create account — 403 while registration is disabled, weak password → 400, duplicate → 409; sets session cookie |
| POST | `/api/auth/login` | Email + password → session cookie; wrong credentials → 401 |
| GET | `/api/auth/me` | `{ email }` of the current caller — plus `key_id` when the request used an API key |
| POST | `/api/auth/logout` | Drop this session |
| POST | `/api/auth/password` | `{ current, new }` — 403 on wrong current; short password → 400 |

## API keys

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/api-keys` | List `{ id, name, created_at, last_used_at }` — newest first; session cookie required |
| POST | `/api/api-keys` | Create — `{ name }`; response includes the one-time `value`; session cookie required |
| DELETE | `/api/api-keys/:keyId` | Revoke — 404 unknown id; session cookie required |

## Device login (browser-approved CLI access)

A terminal client requests a short code, the user approves it in the browser, and the client polls for a one-time API key (OAuth 2.0 device authorization, RFC 8628). The approval flow and what users see on `/device` are owned by [Accounts & access](/authentication#sign-in-from-a-terminal-device-login).

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/device/code` | Public — `{ client_name }` → `{ device_code, user_code, verification_uri, verification_uri_complete, expires_in: 600, interval: 5 }`; rate-limited per IP |
| GET | `/api/auth/device/pending?user_code=` | Session — resolve a live code for the approval page → `{ client_name, key_name, expires_at }`; unknown/expired/consumed → 404 |
| POST | `/api/auth/device/approve` | Session + CSRF — `{ user_code, decision: "approve" \| "deny", key_name? }` → `{ ok: true }`; approval mints an API key named `bots-cli <client> <UTC date>` unless a name is given |
| POST | `/api/auth/device/token` | Public — poll with `{ device_code }`. Errors carry an OAuth code: `authorization_pending`, `slow_down`, `expired_token`, `access_denied`; the first success returns `{ api_key, key_id, key_name, email }` exactly once and the plaintext key is not retained after claim |

The approval page lives at `/device` (`verification_uri_complete` deep-links it with the code) and requires a login session.

## Configuration backup

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/backup/config` | Export configuration only — `?include_values=true` embeds secret values; default export omits them |
| POST | `/api/backup/config` | Import a raw snapshot or `{ config, secret_values }`; returns created/updated counts per kind — [restore semantics](/operations#configuration-backup) |

Both routes require a browser session and reject API-key bearer authentication with `403`. Import answers with created/updated counts per kind; an import missing new-secret values fails with `missing_secret_names`, and a restore that creates an API key without a stored hash returns its raw value once in `api_key_values`. What the snapshot covers and how restores behave is described in [Operations](/operations#configuration-backup).

## Bots

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/bots` | List bots incl. derived `health` (`green`/`blue`/`yellow`/`red`/`gray`) and `run_state`; archived rows are omitted by default, while `?archived=1` includes them with `archived`, gray health, and disabled run state |
| POST | `/api/bots` | Create — `{ name, instructions?, model_id?, role_id? }` |
| GET/PATCH/DELETE | `/api/bots/:id` | Read / update fields incl. `enabled` / delete (cascades triggers + runs + notifications) |
| POST | `/api/bots/:id/run` | Run now — `{ message? }`, steers a live loop, returns `{ runId, steered }`; 409 while archived, disabled, or globally paused |
| POST | `/api/bots/:id/archive` | Archive — interrupts any live loop and hides the bot from default listings; schedules, webhooks, chat, Run now, and watchdogs stay frozen |
| POST | `/api/bots/:id/unarchive` | Unarchive — returns the bot in the list with `enabled: false`; it must be enabled again before work resumes |
| POST | `/api/bots/:id/interrupt` | Stop the live loop |
| GET | `/api/bots/:id/runs` | Run history (status ok/error/interrupted, output, error) |
| GET | `/api/bots/:id/runs/:runId/transcript` | Replay for one run: `{ run, usage, steps }`; steps are chronological `user`/`assistant`/`tool_call` (args summary)/`tool_result` (persisted output, `duration_ms`, `is_error`) with `retry_wait_ms` where recorded; `steps: []` when no messages are linked to the run |
| GET | `/api/bots/:id/usage` | Token totals for the bot: `{ lifetime, last30d, budget }`; windows carry `input`, `output`, `cache_read`, `cache_write`, `total`, and `budget` is the trailing-30-day token cap (`null` = unlimited) |
| GET | `/api/bots/:id/context-usage` | Estimated context split: `{ context_window, categories: { system_prompt, tools, conversation }, used, free }`; `context_window`/`free` are `null` with no model configured |
| GET/POST | `/api/bots/:id/messages` | Chat history / inject a chat turn (steers or starts; while globally paused `{ runId: null, held: true }`; 409 when archived or disabled) |
| GET (SSE) | `/api/bots/:id/messages/stream` | Live chat snapshot stream — each `data:` event carries `{ turns, working }`, including partial assistant text and running tool output; bots with no durable conversation receive periodic stored-history snapshots until their first run creates one |
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

The cap is evaluated when a run reaches its terminal status; what a trip does to bots and the pause state lives in [Bots](/bots#lifecycle).

## Triggers

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/bots/:id/triggers` | List / create — `{ kind: "schedule"\|"webhook", message, schedule? }`; webhook responses include the secret once |
| PATCH | `/api/triggers/:id` | Update `message`, `schedule`, or `enabled` (bool; resume never catch-up-fires) |
| DELETE | `/api/triggers/:id` | Remove |
| POST | `/api/triggers/:id/rotate-secret` | New webhook secret (destructive — invalidates the old one immediately) |
| POST | `/api/schedule/preview` | `{ schedule }` → `{ valid, next[] }` — up to five server-local ISO occurrences; an invalid expression returns `valid: false` and no entries |

## Templates

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/templates` | List reusable bundles — newest first |
| POST | `/api/templates` | Create — `{ name, description?, instructions?, machine_id?, role_id?, triggers?: [{ message, schedule }] }`; unknown refs / bad schedules → `400`, duplicate name → `409` |
| PATCH | `/api/templates/:id` | Partial update (same validation) |
| DELETE | `/api/templates/:id` | Delete — bots created from it are untouched |

See [Templates](/templates) for the UI flow.

## Search

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/search?q=...&types=bots,archived_bots,roles,...` | Case-insensitive substring search across active and archived bots (name + instructions), roles (name + instructions), skills/projects/templates (name + description), tags and teams (name); defaults to every type; unknown types → `400` |

Responses are `{ groups: [{ type, total, matches }] }`, capped at eight matches per group while `total` reports all matches. Each match is `{ type, id, name, subtitle }`. The UI uses this endpoint for its global search overlay; see [Search & commands](/search).

## Secrets

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/secrets` | List `{ id, name, key, created_at }` — values hidden |
| POST | `/api/secrets` | Create — `{ name, key, value }`; duplicate name or invalid env-var key → `400` |
| GET | `/api/secrets/:secretId` | Read metadata without the value |
| GET | `/api/secrets/:secretId/value` | Reveal the current plaintext value for an authorized action |
| PATCH | `/api/secrets/:secretId` | Update supplied fields; replacing `value` is destructive |
| DELETE | `/api/secrets/:secretId` | Remove — running sandboxes must restart to drop its variable |

Creating a secret or replacing its value returns `503 { "error": … }` when no usable `SECRETS_KEY` is configured. Bots return their `secret_ids` in the bot API and accept updates through `PATCH /api/bots/:id`; teams support `secret_ids` on their PATCH route. See [Secrets](/secrets) for injection, storage and redaction behavior.

## Control MCP (`/mcp`)

External agents drive the same surface over MCP at streamable HTTP `POST /mcp`, authenticated with an API key (`Authorization: Bearer bots_…`; session cookies don't apply). JSON-RPC methods: `initialize`, `tools/list`, `tools/call`. Tools are flat verbs whose results mirror the REST payloads exactly: `bots_list`, `bot_get`, `bot_create`, `bot_set_role`, `run_now`, `interrupt`, `runs_tail` (accepts `limit`, max 100). A **Settings → System → Control MCP** switch enables the endpoint; while disabled `/mcp` returns `404`. Unknown or revoked keys are rejected with `401` before any JSON-RPC method runs.

## Notifications

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/notifications` | `{ items, unread_count }`, newest first; `?limit=` 1–250 (default 100) |
| GET | `/api/inbox` | Live attention items newest first: run failures, blocked/watchdog bots and an armed spend breaker without duplicating unread notifications |
| POST | `/api/notifications/:id/read` | Mark one read — 404 unknown id |
| POST | `/api/notifications/read-all` | Mark everything read |

Created automatically when a run ends `error` (deduped per run). Each item carries its resolved click destination in `target_path`. See [Notifications](/notifications).

## Event destinations

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/hooks` | List `{ id, name, url, event_types[], enabled }`; secrets hidden |
| POST | `/api/hooks` | Create `{ name, url, secret, event_types[] }` — `secret` required |
| PUT | `/api/hooks/:id` | Update a destination; omit or blank `secret` to keep the current value |
| DELETE | `/api/hooks/:id` | Remove destination and delivery logs |
| GET | `/api/hooks/:id/deliveries` | Recent attempts newest first; `?limit=` 1–250 (default 100) |
| POST | `/api/hooks/:id/test` | Send a manual `ping`; returns status/latency — `409` when disabled |

Outbound deliveries POST `{ id, type, occurred_at, data }` with `X-Bots-Signature: sha256=<hmac>`. Supported event types and delivery behavior live in [Event destinations](/event-destinations).

## Roles, skills & MCP servers

CRUD on `/api/roles`, `/api/skills`, `/api/mcp-servers`. Roles accept `instructions` plus capability grants `mcp_server_ids: []` and `skill_ids: []`; unknown ids → `400`. Skills require `name` + `instructions`; MCP servers require unique `name`, non-empty `command`, optional `args[]`, and `env{}` whose values are either literal strings or `{ "secret": "<managed secret name>" }` references (unknown or deleted names → `400`); `POST /api/mcp-servers/:id/test` runs the handshake.

Skill import (never writes until confirmed): `GET /api/skills/search?q=` proxies skills.sh candidates, `POST /api/skills/preview` resolves a source (`owner/repo`, repo URL with optional `/tree/<ref>/<path>`, `@<skill>` filter, `#<ref>` pin) into per-`SKILL.md` previews with commit, file count, size and content hash, and `POST /api/skills/import { source, folders[] }` stores the selected bundles byte-for-byte plus immutable provenance (`import_info` on the skill row) — rejecting unreachable or internal (`source host not allowed`) sources, oversized bundles (>200 files or >5 MB), and invalid frontmatter with nothing saved.

Skill updates: imported skill payloads include `update_state` (`status`, `checked_at`, `modified`, `pinned`); hand-written rows return null. `POST /api/skills/check` checks every imported skill sequentially and returns `{ results, skills }`. Single-skill `/check` and `/update` actions return `{ id, status, error, skill }`: checks record `up_to_date`, `update_available`, or `source_unavailable`; updates return `updated`, `up_to_date`, `source_unavailable`, or `pinned`. Checks never mutate installed content; applying an update replaces metadata, instructions, and bundled files while preserving the id and grants. `POST /api/skills/:id/detach` returns the detached skill with provenance cleared and current content retained.

## Webhooks

`POST /api/webhooks/:triggerId` with `Authorization: Bearer <secret>` — oversized bodies over 64 KB answer `413 { "error": "payload too large" }` first, then endpoint/trigger budgets answer `429 { "error": "rate_limited" }`; bad tokens answer `401`, while disabled triggers/bots and global pause answer `409`.
