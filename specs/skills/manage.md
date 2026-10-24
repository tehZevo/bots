# Skills management

- A skill is an instruction bundle — `SKILL.md` plus optional references, scripts and assets — stored on the server, identified by an immutable generated id (uuid); name and optional one-line description are editable display metadata.
- Skills are instructions, not integrations: they live on their own top-level **Skills tab**; the Integrations tab keeps only external connectors (MCP servers).
- The Skills tab follows the resource-tab pattern (`../ui/resource-tabs.md`); its Add action offers both manual creation and import (`import.md`).
- Name and instructions are required; grants always reference skill ids, never names.
- Renaming a skill updates every grant and listing in place; running bots pick up renamed or edited skills on their next run.
- Skills take part in prompts only once role capabilities grant them (`roles/capabilities.md`); managing skills never affects running bots.
