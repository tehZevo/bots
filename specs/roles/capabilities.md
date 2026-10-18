# Role capabilities

- A role grants capabilities; a bot's effective toolset and prompt come from its role instead of the fixed built-in defaults.
- Capability kinds: built-in tools (`shell`, `web_fetch`), MCP servers and skills — the latter two referenced by id from their registries (`mcp_servers`, see `web-ui/integrations.md`; `skills`, see `skills/manage.md`).
- Without a role a bot gets the current default set (built-in tools only); granting is additive over that baseline.
- MCP servers connect from the orchestrator; their tools are exposed to the agent namespaced as `<server>_<tool>` and fail per-call without breaking the loop when the server is unreachable.
- Granted skills append their instruction markdown to the effective system prompt, after the bot's own prompt.
- Roles edit capabilities from the Roles tab: checkbox pickers over existing MCP servers and skills; deleted grants vanish silently at next load if a referenced server or skill was removed.

- Capability changes apply at the next loop start; unknown capability ids are rejected with 400 on role save.
