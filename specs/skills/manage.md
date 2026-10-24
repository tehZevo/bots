# Skills management

- A skill is an instruction bundle — `SKILL.md` plus optional references, scripts and assets — stored on the server, identified by an immutable generated id (uuid); name and optional one-line description are editable display metadata.
- Skills are instructions, not integrations: they live on their own top-level **Skills tab**; the Integrations tab keeps only external connectors (MCP servers).
- The Skills tab shows one card per skill (name + optional description) with Add offering manual creation or import (`import.md`), Edit opening a modal with a fixed-size markdown textarea (`../ui/forms.md`) and delete behind the confirm dialog (`../ui/confirm.md`); an empty-state line shows when no skills exist.
- Empty names or empty instructions return 400 with an error message; duplicate display names are allowed since grants reference skill ids, never names.
- Renaming a skill updates every grant and listing in place; running bots pick up renamed or edited skills on their next run. Editing an imported skill marks it modified (`updates.md`).
- Skills persist across restarts and take part in prompts only once role capabilities grant them (`roles/capabilities.md`); managing skills never affects running bots.
