# Skills management

- A skill is a named markdown instruction pack stored on the server: unique name, optional one-line description, instructions body.
- Skills are created and managed in a `Skills` section of the Integrations tab (`web-ui/integrations.md`): list showing name + description, add/edit modal with a fixed-size markdown textarea (see `web-ui/forms.md`), delete behind a confirm dialog (`confirm.md`).
- Duplicate names or empty instructions return 400 with an error message; names are immutable after creation to keep grants stable — renaming means creating a new skill.
- Skills persist across restarts and take part in prompts only once role capabilities grant them (ROADMAP); managing skills never affects running bots.
