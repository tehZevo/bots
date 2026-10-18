# Role capabilities

- A role grants capabilities; a bot's effective toolset and prompt come from its role instead of the fixed built-in defaults.
- Capability kinds: built-in tools (`shell`, `web_fetch`), MCP servers (name + connection config), skills (markdown instruction packs stored server-side).
- Without a role a bot gets the current default set (built-in tools only); granting is additive over that baseline.
- MCP servers connect from the orchestrator; their tools are exposed to the agent namespaced as `<server>_<tool>` and fail per-call without breaking the loop when the server is unreachable.
- Granted skills append their instructions to the effective system prompt, after the bot's own prompt (see `bots/registry.md`).
- Capability changes apply at the next loop start; unknown capability ids are rejected with 400 on role save.
