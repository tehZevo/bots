# Roles

A role is reusable instruction text that shapes what a bot does; a bot has at most one role.

- A `Roles` tab in navigation lists roles as cards (name + instructions preview); create, edit, and delete roles there.
- The tab has a search field filtering the cards by name/instructions text (case-insensitive substring) with an empty "no matches" state.
- **Create role** button opens a modal (same pattern as `web-ui/create-bot.md`): name + instructions fields, Save/Cancel; Escape cancels.
- Clicking a card opens that role in an edit modal with exactly three tabs: `General`, `MCP` and `Skills`. `General` holds the prefilled name and instructions fields; `MCP` and `Skills` hold one grant picker each (see `roles/capabilities.md`).
- The active tab is marked and the modal starts on `General`; switching tabs saves nothing and keeps pending edits in every tab, and the modal's Save writes name, instructions and both grant sets in one request. Delete stays in the modal footer; closing without saving changes nothing; the tab itself shows only the list.
- Opening a modal focuses the name field once; afterwards focus and caret stay wherever the user put them, including while other fields are edited.
- Delete role asks for confirmation first (see `web-ui/confirm.md`).
- Stored per role: name (required), instructions (required). CRUD via `/api/roles`; invalid input returns 400 with an error message.
- A bot's detail view assigns its role from a picker; assigning or switching applies to subsequent runs — clearing sets it back to none. Deleting a used role unsets it on those bots.
- The effective system prompt always starts from the generic default plus the bot's name line and instructions, then the assigned role's instructions and granted skill markdown.
