# Accounts & access

The UI and API are login-protected. The sign-in screen asks `/api/auth/config` whether accounts exist and registration is enabled, then offers **Sign in** or **Create account**. Registration is disabled by default; start the server once with `ALLOW_REGISTRATION=true`, create your account, then remove it. Every signed-in user has equal access to all bots and settings — there is no admin tier.

Sessions use an HttpOnly cookie for seven days. Settings → **Account** shows the signed-in email, lets you change your password (minimum eight characters; other sessions are invalidated), or log out from this browser.

## API keys

Settings → **API keys** manages credentials for headless access:

- Each key is `bots_` plus 40 hex characters and is shown exactly once after creation — store it immediately.
- The server stores only a hash, so the list can show name, created-at and last-used time but cannot recover a lost value.
- Send it as `Authorization: Bearer <api key>`. Revoking takes effect on the next request; malformed or revoked keys receive `401`.

Use an API key for scripts, the CLI and Control MCP. Browser session cookies are not used by those clients. Raw routes are listed in the [API reference](/api).

## Device login

Device login lets a terminal obtain an API key without pasting a password:

1. The client requests a short code and prints the `/device` verification URL plus an `XXXX-XXXX` code.
2. Open the URL and sign in to the web UI if prompted.
3. Review the client name and expiry, optionally rename the issued key — the default is `bots-cli <client> <date>` — then approve or deny access.
4. The terminal claims the one-time API key directly from the server; the browser never displays it.

Codes expire after ten minutes, and pending approvals do not survive a server restart. If the code is unknown, expired or already used, the approval page says so before any key is issued. For raw OAuth device-flow endpoints, see the [API reference](/api).
