# Settings tabs

- The `Settings` tab has General, Providers and System sections; `/settings?tab=<providers|system>` deep-links a section, while General uses `/settings`. Switching sections with an unsaved form follows `../ui/unsaved-changes.md`.
- **General** holds the theme choice (see `../ui/theme.md`), notification sound and browser push controls (`../notifications/in-app.md`), sandbox idle timeout, self-service password change, and the spend circuit breaker's trailing-30-day token cap (`../usage/circuit-breaker.md`).
- **Providers** owns provider CRUD, model lists/detection, and the default provider/model picker (see `../llm/providers.md`). Settings remains the only home of server-wide LLM configuration.
- **System** owns REST API keys (`../api/rest-keys.md`), the Control MCP toggle, signed-in account/logout information, and config backup export/restore (`config-backup.md`).
- Sandbox idle timeout: minutes an inactive bot container survives before reaping, default 5; applies to every bot with no active run and persists on the server. Its input tracks unsaved changes and guards section switches per `../ui/unsaved-changes.md`.
- Changes take effect for subsequent reaping decisions without a restart.
