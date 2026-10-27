# Settings tab

- The `Settings` tab holds server-wide preferences alongside the theme choice (see `../ui/theme.md`).
- LLM providers and the default provider/model are managed here (see `../llm/providers.md`).
- Notification sound and browser push controls live here (`../notifications/in-app.md`).
- Config backup export/restore lives here (`config-backup.md`).
- Sandbox idle timeout: minutes an inactive bot container survives before reaping, default 5; applies to every bot with no active run and persists on the server. Its input tracks unsaved changes and guards tab switches per `../ui/unsaved-changes.md`.
- Changes take effect for subsequent reaping decisions without a restart.
- The spend circuit breaker's trailing-30-day token cap is set here (`../usage/circuit-breaker.md`).
