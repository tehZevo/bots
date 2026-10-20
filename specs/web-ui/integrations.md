# Integrations tab

- A top-level `Integrations` tab follows the sidebar, drawer, title and icon rules of `navigation.md`.
- The first integration kind is MCP servers; further kinds appear as additional sections within the same tab.
- An MCP server record: unique name, transport (only `stdio`), command + args list, optional environment variables, enabled flag. Values of env vars render masked after save.
- Servers are listed with add/edit modal and delete behind a confirm dialog (`confirm.md`); duplicate names or empty commands return 400 with an error message.
- The add/edit MCP modal follows the stacked full-width form layout of `forms.md`.
- Environment variables are edited as key/value rows, never a free-text box: each row pairs a KEY input and a value input side by side with a remove button; an "Add variable" button appends empty rows. Rows with an empty key are dropped on save; duplicate keys return 400 with an error message. The rows scroll inside a fixed-height area so the dialog keeps a constant size.
- A `Test connection` action starts the configured server, performs the MCP initialize handshake and reports the discovered tool count; failures show the inline error without saving side effects beyond persistence already done.
- Records persist on the server across restarts. Saving a server does not affect running bots until role capabilities grant it (`roles/capabilities.md`).
