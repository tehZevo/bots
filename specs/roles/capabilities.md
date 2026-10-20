# Role capabilities

- A role grants capabilities; a bot's effective toolset and prompt come from its role instead of the fixed built-in defaults.
- Capability kinds: built-in tools (`shell`, `web_fetch`), MCP servers and skills — the latter two referenced by id from their registries (`mcp_servers`, see `../mcp/servers.md`; `skills`, see `skills/manage.md`).
- Without a role a bot gets the current default set (built-in tools only); granting is additive over that baseline.
- MCP servers connect from the orchestrator; their tools are exposed to the agent namespaced as `<server>_<tool>` and fail per-call without breaking the loop when the server is unreachable.
- Granted skills append their instruction markdown to the effective system prompt in the order defined by `bots/registry.md`.
- Roles grant MCP servers and skills from their own tabs in the role edit modal (`manage.md`): each of the `MCP` and `Skills` tabs is a checkbox picker over the existing registry entries, so the two grant kinds are never edited in one list; deleted grants vanish silently at next load if a referenced server or skill was removed.
- Capability changes apply at the next loop start; unknown capability ids are rejected with 400 on role save.
