# MCP integrations

**Integrations** manages Model Context Protocol servers that extend bots with external tools. Only `stdio` transport is supported today: the orchestrator spawns the configured command and speaks JSON-RPC over stdin/stdout. Grant servers to bots through roles — [Roles, skills & capabilities](/roles-capabilities-skills#capabilities-mcp-servers) owns how granted tools reach a bot. Disabled servers never connect.

## Adding a server

Fill in name (unique), command (e.g. `npx`) and one argument per line; duplicate names or an empty command are rejected on save. Environment variables are edited as key/value rows with a **Literal** / **Secret** toggle for each row:

- Literal values stay masked after saving.
- Secret mode replaces the value input with a picker over existing managed secrets — only the secret's name is stored. A deleted or unknown reference must be repointed; saving it returns `400`. At spawn and test time, the reference resolves to the secret's current value — editing the secret applies without re-saving the server; deleting it yields an empty string for that variable.
- Rows with an empty key are dropped on save; duplicate keys show an inline error before anything is saved.

The server process starts with a minimal allowlisted environment — only `PATH` and the orchestrator's own `HOME`, plus exactly the variables declared on that row (a declared key overrides the baseline, an empty value is still passed) — never the orchestrator's full environment, so host credentials or deployment tokens can’t leak into tool output.

**Test connection** boots the server with that same environment, runs the MCP handshake and reports how many tools it discovered; failures show inline without side effects. Saving a server changes nothing for running bots until a role grants it.
