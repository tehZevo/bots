# Multi-user accounts and ownership

- The API and UI are protected by login sessions: email + password credentials, cookie-based session after sign-in, a `Logout` action in Settings; unauthenticated API calls return 401.
- First-run bootstrap: with no users configured the server opens normally (single-operator mode); creating the first account claims admin and locks registration — further accounts are added by admins.
- Every bot has exactly one owner (the creating user; admins can transfer). Non-owner, non-admin users get 404 for another user's bots and their runs, triggers and messages, matching existing privacy phrasing.
- Admins manage all bots and own server-wide settings: providers, default model and MCP servers are admin-only to view and edit (API keys never leave the server); roles and skills stay shared readable, editable by admins only.
- Credentials are stored hashed; placeholder tokens stand in for provider secrets inside agent-facing surfaces so models never see them (`llm/providers.md`).
