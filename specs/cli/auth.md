# CLI authentication

- `bots auth login [--url URL] [--email EMAIL]` is the terminal default: it reads `GET /api/auth/config`, prompts for email unless given, prompts for a hidden password (or reads `--password-stdin`), and sends `POST /api/auth/login`.
- The login cookie is kept in memory only. The CLI uses it to `POST /api/api-keys` with name `bots-cli <hostname> <YYYY-MM-DD>` (overridable with `--key-name`), then calls `POST /api/auth/logout` and persists `{ url, email, api_key, key_id, key_name }`.
- `--web`, terminal password login and `--api-key` are mutually exclusive; conflicting flags or missing credentials in non-interactive use exit 2.
- `--web` uses the browser-approved device flow in `../auth/device-login.md`; it opens the verification URL when a browser is available, prints the code otherwise, and `--no-browser` forces print-only.
- When no account exists and registration is disabled, terminal login surfaces the server error and points at the `ALLOW_REGISTRATION` bootstrap in `../auth/multi-user.md`.
- `--api-key VALUE` and `--api-key-stdin` skip both flows: they validate the `bots_` + 40 hex shape, call `GET /api/auth/me`, and persist the key, its id and email without prompting.
- `GET /api/auth/me` returns `{ email, key_id }`, where `key_id` identifies the authenticating API key and is null for cookie sessions; this lets a pasted key be revoked on logout.
- A successful login replaces existing state. After the new key is persisted, the previous `key_id` is revoked when present; revocation failure prints a warning but does not undo the login.
- `bots auth logout [--keep-key]` revokes the stored `key_id` unless `--keep-key`, then deletes the local config. Local deletion happens even if the key was already revoked or the revoke request fails.
- `bots auth status` prints URL, email, key name/id, masked key and whether the value came from flag, environment or config; it verifies with `GET /api/auth/me`, exits 3 when the key is invalid, and exits 3 with a login hint when no config exists.
- `bots auth signup` prompts for credentials, maps `POST /api/auth/signup`, then mints and stores a key exactly like terminal login; a 403 registration-disabled response is surfaced unchanged.
- `bots auth password` prompts for current and new passwords and maps `POST /api/auth/password`; `bots auth config` maps `GET /api/auth/config`.
- Passwords and keys never appear in argv, logs, errors or `--verbose`; the password prompt disables echo, and HTTPS rules from `overview.md` apply.
