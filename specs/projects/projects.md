# Projects

- A Project is a global, reusable shared-context resource: a named markdown document (single body) that can be attached to bots and/or teams.
- Projects are managed on a top-level `Projects` tab following the resource-tab pattern (`../ui/resource-tabs.md`); cards show the optional one-line description and the edit modal holds a single markdown body. Name and body are required.
- A bot attaches to any number of Projects via a multi-select picker in the bot detail `General` tab (`../bots/detail.md`); a team may reference Projects and all members inherit them (`teams/teams.md`).
- Effective system prompt appends attached Project bodies (team-inherited first, then the bot's direct attachments) in the order defined by `bots/registry.md`; edits apply at the next loop start.
- A soft size warning is shown when combined Project content makes the prompt unusually large; saving is not blocked.
- Attach/detach is available via `/api/projects` and the control MCP server (`mcp/control-server.md`, `api/rest-keys.md`).
