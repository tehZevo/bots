# Browser-approved CLI login

- `bots auth login --web` uses OAuth 2.0 device authorization (RFC 8628): the CLI shows a short code, the user approves in the web UI, and the CLI polls until it receives a one-time API key.
- `POST /api/auth/device/code` is public and accepts `{ client_name }`. It returns `{ device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval }`. It and the token route are exempt from the session/API-key middleware, like login.
- `device_code` is 32 random bytes stored hashed. `user_code` is 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, formatted `XXXX-XXXX`; matching ignores case, spaces and hyphens. Codes expire after 10 minutes and the polling interval is 5 seconds.
- `verification_uri` is `<origin>/device`; `verification_uri_complete` appends `?user_code=...`. The CLI sends `client_name` as its hostname.
- `GET /device` requires a login session and redirects unauthenticated visitors to login with a return to `/device`. It shows the resolved client name, requested key name and expiry before approval.
- `GET /api/auth/device/pending?user_code=...` is session-authenticated and returns `{ client_name, key_name, expires_at }` for a live code; unknown, expired or consumed codes return 404.
- `POST /api/auth/device/approve` is session-authenticated, accepts JSON under the normal CSRF rules, and takes `{ user_code, decision: "approve" | "deny", key_name? }`.
- Approval mints an API key owned by the approving user, named `key_name` or `bots-cli <client_name> <UTC date>`; denial records no key. Either decision answers `{ ok: true }` and consumes the code.
- `POST /api/auth/device/token` accepts `{ device_code }`. Pending polls return `400 { "error": "authorization_pending" }`; early polls return `slow_down`, dead grants return `expired_token` or `access_denied`, and the first success returns `{ api_key, key_id, key_name, email }` exactly once.
- The approval page never displays the key. The plaintext key is available to one successful poll and is not retained after claim; pending grants do not survive a server restart.
- Device-code creation, code lookup and polling are rate-limited per IP and per code. Registration and signup inside the approval flow follow `multi-user.md`.
- The CLI prints the URL and code before polling, honors the server interval, adds 5 seconds on `slow_down`, stops on expiry or denial, and stores the key, key id, key name and email like terminal login.
- OpenAPI lists the device routes, their error codes, and the `key_id` field on `/api/auth/me`.
