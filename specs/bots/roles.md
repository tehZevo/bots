# Roles

A role is reusable instruction text that shapes what a bot does; a bot has at most one role.

- A `Roles` tab in navigation lists roles as cards (name + instructions preview); create, edit, and delete roles there.
- Stored per role: name (required), instructions (required). CRUD via `/api/roles`; invalid input returns 400 with an error message.
- A bot's detail view assigns its role from a picker; assigning or switching applies to subsequent runs — clearing sets it back to none. Deleting a used role unsets it on those bots.
- The effective system prompt is the bot's own system prompt followed by the assigned role's instructions; with no role, only the bot's prompt (or generic default) is sent.
