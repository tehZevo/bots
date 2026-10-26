# MCP integrations

**Integrations** manages Model Context Protocol servers that extend bots with external tools. Only `stdio` transport is supported today: the orchestrator spawns the configured command and speaks JSON-RPC over stdin/stdout.

## Adding a server

Fill in name, command (e.g. `npx`) and one argument per line; environment variables are edited as key/value rows (values render masked after save). Rows with an empty key are dropped on save; duplicate keys show an inline error before anything is saved. The server process starts with a minimal allowlisted environment — only `PATH` and the orchestrator's own `HOME`, plus exactly the variables declared on that row (a declared key overrides the baseline, an empty value is still passed) — never the orchestrator's full environment, so host secrets like `DATABASE_PATH` or deployment tokens can't leak into tool output. **Test connection** boots the server with that same environment, runs the MCP handshake and reports how many tools it discovered — failures show inline without side effects.

## Using them

Servers aren't wired to bots directly: grant them per [role capability](/roles-capabilities-skills). A bot's loop then exposes each granted server's tools as `<server>_<tool>`. Disabled servers never connect.
