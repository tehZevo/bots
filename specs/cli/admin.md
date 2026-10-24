# CLI provider, setting, key and notification commands

- `provider list|get|create|update|delete|detect` map `/api/providers`; create requires `--name` and `--base-url`; flags include `--api-key`/`--api-key-stdin` and repeatable `--model`. Keys are sent but never printed.
- Provider update maps PUT and fetches the current row first so omitted flags preserve existing values; `provider get` lists and filters because there is no single-provider route.
- `provider detect --base-url URL [--api-key VALUE|--api-key-stdin] [--id ID]` maps `POST /api/providers/detect` and prints the sorted model ids.
- `setting get` maps GET `/api/settings`. `setting set` maps PUT with `--default-provider`, `--default-model`, `--idle-minutes 0-1440`, `--control-mcp on|off`, plus `--clear-default-provider` and `--clear-default-model`; unset flags are omitted and no flags exits 2.
- `--default-provider` accepts a provider name or id and sends its id; `--default-model` sends the model string unchanged.
- `key list|create|revoke` map `/api/api-keys`; create requires `--name` and prints the one-time `value`; revoke is confirmed and takes a key id.
- `notification list [--limit N] [--unread]` maps GET and filters unread locally; the server accepts limits 1-250 and defaults to 100.
- `notification read <id>` and `notification read-all` map the POST routes and print the result.
- `bots health` maps GET `/api/health`; `bots status` also calls `/api/auth/me` and prints server URL, health, email and key name.
- `bots openapi` prints the pretty JSON from `GET /api/openapi.json`.
- `auth` commands are specified in `auth.md`; `api` is specified in `api.md`.
