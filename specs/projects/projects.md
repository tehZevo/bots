# Projects

- A Project is a global, reusable shared-context resource: a named markdown document (single body) that can be attached to bots and/or teams.
- Projects are managed in a top-level `Projects` tab (`Bots`, `Roles`, `Integrations`, `Skills`, `Projects`, `Settings`), following the sidebar, drawer, title and icon rules of `navigation.md`: one card per project (name + optional one-line description), Add/Edit modal with a fixed-size markdown textarea, delete behind the confirm dialog (`confirm.md`).
- Empty name or empty body returns 400 with an error message; duplicate display names are allowed since references use project ids.
- A bot attaches to any number of Projects via a multi-select picker in the bot detail `General` tab (`web-ui/bot-detail.md`); a team may reference Projects and all members inherit them (team inheritance activates with `teams/teams.md`).
- Effective system prompt appends attached Project bodies (team-inherited first, then the bot's direct attachments) after the role's instructions; edits apply at the next loop start.
- A soft size warning is shown when combined Project content makes the prompt unusually large; saving is not blocked.
- CRUD and attach/detach are available via `/api/projects` and the control MCP server (`mcp/control-server.md`, `api/rest-keys.md`); records persist across restarts.
