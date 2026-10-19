# MCP integrations

**Integrations** manages Model Context Protocol servers that extend bots with external tools. Only `stdio` transport is supported today: the orchestrator spawns the configured command and speaks JSON-RPC over stdin/stdout.

## Adding a server

Fill in name, command (e.g. `npx`) and one argument per line; environment variables are edited as key/value rows (values render masked after save). **Test connection** boots the server, runs the MCP handshake and reports how many tools it discovered — failures show inline without side effects.

## Using them

Servers aren't wired to bots directly: grant them per [role capability](/roles-capabilities-skills). A bot's loop then exposes each granted server's tools as `<server>_<tool>`. Disabled servers never connect.
