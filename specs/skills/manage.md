# Skills management

- A skill is a markdown instruction pack stored on the server, identified by an immutable generated id (uuid); name and optional one-line description are editable display metadata.
- Skills are created and managed in a `Skills` section of the Integrations tab (`web-ui/integrations.md`): list showing name + description, add/edit modal with a fixed-size markdown textarea (see `web-ui/forms.md`), delete behind a confirm dialog (`confirm.md`).
- Empty names or empty instructions return 400 with an error message; duplicate display names are allowed since grants reference skill ids, never names.
- Renaming a skill updates every grant and listing in place; running bots pick up renamed or edited skills on their next run.
- Skills persist across restarts and take part in prompts only once role capabilities grant them (ROADMAP); managing skills never affects running bots.
