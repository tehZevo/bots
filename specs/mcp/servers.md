# Integrations tab

- The top-level `Integrations` tab follows the resource-tab pattern (`../ui/resource-tabs.md`). The first integration kind is MCP servers; further kinds appear as additional sections within the same tab.
- An MCP server record: unique name, transport (only `stdio`), command + args list, optional environment variables, enabled flag. Values of env vars render masked after save.
- Declared env vars are the only host values a server's process receives (`child-env.md`); a declared value reaches that one server's process only.
- Names are unique and the command is required; violations return 400 with an error message.
- Environment variables are edited as key/value rows, never a free-text box: each row pairs a KEY input and a value input side by side with a remove button; an "Add variable" button appends empty rows. Rows with an empty key are dropped on save; duplicate keys return 400 with an error message. The rows scroll inside a fixed-height area so the dialog keeps a constant size.
- A `Test connection` action starts the configured server, performs the MCP initialize handshake and reports the discovered tool count; failures show the inline error without saving side effects beyond persistence already done.
- Saving a server does not affect running bots until role capabilities grant it (`../roles/capabilities.md`).
