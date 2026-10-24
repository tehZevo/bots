# Multi-user accounts and sessions

- The API and UI are protected by login sessions: email + password credentials, cookie-based session after sign-in, a `Logout` action in Settings; unauthenticated API calls return 401.
- Registration is controlled by the container env var `ALLOW_REGISTRATION` (`true`/`false`, default `false` when unset): with it on anyone may create an account; with it off the sign-up screen hides.
- There is no admin tier: every authenticated user sees and edits all bots, triggers, runs, messages, settings, roles and skills equally.
- A fresh install with registration disabled is bootstrapped by temporarily setting `ALLOW_REGISTRATION=true`, creating the first account, then disabling it again.
- Self-service password change is available in Settings, requiring the current password for confirmation; there is no email-based reset or 2FA.
- Sessions expire after a fixed duration (7 days) with no "remember me"; re-login is required afterwards.
- API keys are per-user: each user creates and revokes their own keys, and a key acts as that user.
- `GET /api/auth/me` returns `{ email, key_id }`: `key_id` identifies the authenticating API key for Bearer requests and is null for cookie sessions.
- Credentials are stored hashed; placeholder tokens stand in for provider secrets inside agent-facing surfaces so models never see them (`llm/providers.md`).
