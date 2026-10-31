# Accounts & access

The UI and API are login-protected. The sign-in screen offers **Sign in**, plus **Create account** while registration is enabled — enable it through [runtime configuration](/operations#runtime-configuration) to create the first account. Every signed-in user has equal access to all bots and settings; there is no admin tier.

A sign-in lasts seven days on that browser, then you sign in again — there is no "remember me" choice. Signing in works over plain HTTP as well as HTTPS, so a LAN or Tailscale hostname such as `http://hostname:8075` is fine; the session cookie only carries the `Secure` flag when the connection is actually encrypted. Settings → **General** holds self-service password change: fill in **Current password** and **New password** (at least eight characters) and press **Change password**; every other session is logged out, this one stays signed in. Settings → **System** shows the signed-in account and offers **Logout**.

## API keys

Headless access — scripts, the CLI, Control MCP — uses API keys, managed under Settings → **System** in the **API keys** section:

- Type a name and press **Add key**; the value (`bots_` plus 40 hex characters) appears once with "New key — shown once". Store it immediately.
- A lost key can't be recovered — the server keeps only a hash, so you revoke (**Revoke**) and create a new one.
- Send it as `Authorization: Bearer <api key>`; revoking takes effect on the next request.

Raw routes, rate-limit budgets and error bodies are in the [API reference](/api).

## Sign in from a terminal (device login)

1. A terminal requests a short code and prints the `/device` verification URL plus an `XXXX-XXXX` code ([CLI basics](/cli#authentication)).
2. Open the page, sign in if asked, review the client name and expiry — optionally rename the key (default `bots-cli <client> <date>`) — then press **Approve** or **Deny**.
3. The terminal claims the new API key directly; the browser never displays it.

Codes expire after ten minutes, and an unapproved code does not survive a server restart. If the code is unknown, expired or already used, the approval page says so before any key is issued.
