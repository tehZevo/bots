# Multi-user accounts and sessions

- The API and UI are protected by login sessions: email + password credentials, cookie-based session after sign-in, a `Logout` action in Settings; unauthenticated API calls return 401.
- Registration is controlled by the container env var `ALLOW_REGISTRATION` (`true`/`false`, default `false` when unset): with it on anyone may create an account; with it off only admins can add users from Settings, and the sign-up screen hides itself.
- The first account ever created claims admin regardless of the flag, so a fresh install stays bootstrap-able.
- No ownership model yet: every authenticated user sees and edits all bots, triggers, runs and messages equally; per-user visibility/ownership returns to the ROADMAP for later.
- Admins alone manage server-wide settings: providers, default model and MCP servers (API keys never leave the server); roles and skills are editable by admins only, readable by everyone signed in.
- Credentials are stored hashed; placeholder tokens stand in for provider secrets inside agent-facing surfaces so models never see them (`llm/providers.md`).
