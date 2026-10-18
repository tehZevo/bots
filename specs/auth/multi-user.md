# Auth and users

- Every `/api` route except `/api/health` requires an authenticated session; the web UI shows a login screen when unauthenticated.
- Sessions are HttpOnly cookies issued by `POST /api/session` from username + password; logout deletes the cookie. The first account created is admin.
- Users own bots, triggers and runs; another user's resources return 404 to keep existence private until teams exist (ROADMAP).
- Server-wide settings and LLM provider management are admin-only; provider keys stay server-side (`llm/providers.md`) so models never see them.
- Password hashes use node `scrypt`; no recovery flow exists yet — admins reset via CLI-less API call.
