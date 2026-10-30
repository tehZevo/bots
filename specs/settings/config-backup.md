# Config backup and restore

- `Settings` offers Export and Restore producing/consuming one JSON snapshot of configuration only: bots (fields + role/tags/teams/Projects references), roles, skills with bundles, MCP servers, Projects, tags, teams, templates, secret names+keys, REST API keys.
- Excluded by construction: runs, messages/chat history, token usage and budgets' accrued numbers, notifications, webhook deliveries and logs, users and credentials, LLM provider values (`../llm/providers.md`), pause state, sandbox idle timeout, bot workspaces and avatars.
- The include-values opt-in names its subject in visible text — "Secret values in export" — with the state word beside it (`Included` / `Names only`); the bare toggle carries meaning on its own.
- Secret *values* stay server-side by default; export embeds them only via an explicit include-values opt-in, and a file without values restores names+keys while keeping each existing value — a missing secret's value is required on restore before the import completes.
- Restore upserts by name per kind: matching records update in place, unknown ones create; nothing is ever deleted; cross-references resolve by name at import, so ids may change and files never pin them.
- The whole file validates before anything applies — malformed JSON or any invalid entity rejects the import with a message and changes nothing (atomic).
- A successful restore reports created/updated counts per kind; running bots keep their current loop and pick restored state up at the next run like ordinary edits (`../roles/capabilities.md`).
- API: `GET /api/backup/config` returns the snapshot; `POST /api/backup/config` imports it with the same validation and reports. Both require a signed-in user (config-level, not key-authenticated — `../api/rest-keys.md`).
