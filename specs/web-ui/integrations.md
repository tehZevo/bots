# Integrations tab

- A top-level `Integrations` tab joins the navigation (`Bots`, `Roles`, `Settings`, `Integrations`), following all sidebar, drawer, title and icon rules of `navigation.md`.
- The first integration kind is MCP servers; further kinds appear as additional sections within the same tab.
- An MCP server record: unique name, transport (only `stdio` for now), command + args list, optional environment variables, enabled flag. Values of env vars render masked after save.
- Servers are listed with add/edit modal and delete behind a confirm dialog (`confirm.md`); duplicate names or empty commands return 400 with an error message.
- A `Test connection` action starts the configured server, performs the MCP initialize handshake and reports the discovered tool count; failures show the inline error without saving side effects beyond persistence already done.
- Records persist on the server across restarts. Saving a server does not affect running bots until role capabilities grant it (ROADMAP).
