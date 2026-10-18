# MCP service discovery

- The MCP Servers section of the Integrations tab has a `Discover` action: it searches an external registry by keyword and lists results with name, description and repository link.
- Choosing a result opens the add-server form prefilled from its metadata — command, args, required environment variables; the user supplies secret values before saving. Discovery itself is read-only and changes nothing until saved.
- The orchestrator talks to exactly one configured registry source speaking the MCP Registry REST API (`GET /v0.1/servers?search=…` with cursor pagination); no authentication for reads.
- A remote server result with a reachable URL may also be inspected in-session via `server/discover` / `.well-known` when supported, shown as extra metadata only.
- Unreachable or malformed registries show an inline error; manual server entry always remains available.
