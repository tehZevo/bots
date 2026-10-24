# Projects

A **project** is global, reusable shared context: a named markdown document that any number of bots can attach to. Attaching appends the project body to each attached bot's system prompt — edits apply at the next loop start. Attachments and records persist across restarts.

## Managing projects

The **Projects** tab lists one card per project (name + optional one-line description). **Add project** opens a modal with name, an optional description line, and a fixed-size markdown textarea; editing uses the same modal and offers **Delete** behind the confirm dialog. Names may repeat — references always use ids — but a name and body are both required (empty values return 400). Saving is never blocked by size, though a soft warning appears when a body grows unusually large.

## Attaching to bots

A bot's General tab shows a checkbox per project; toggling attaches or detaches immediately. A team can attach projects too, and every member inherits them (see [Teams](/teams)). The effective prompt appends inherited project bodies first, then the bot's direct attachments, after the role's instructions.

## API & MCP

Full CRUD lives at `/api/projects` (`GET`, `POST`, `GET/:id`, `PATCH/:id`, `DELETE/:id`); bots accept a `project_ids` array on `PATCH /api/bots/:id`. The control MCP server exposes matching verbs: `projects_list`, `project_create`, `project_update`, `project_delete`, and `bot_set_projects`.
