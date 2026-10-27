# Roles

A role bundles reusable instructions and capability grants; a bot has at most one role.

- The `Roles` tab follows the resource-tab pattern (`../ui/resource-tabs.md`); cards show a name plus instructions preview.
- The tab has a search field filtering the cards by name/instructions text (case-insensitive substring) with an empty "no matches" state.
- **Create role** opens a modal with name and instructions fields; clicking a card opens the same modal for editing with exactly three tabs: `General`, `MCP` and `Skills`. `General` holds the prefilled name and instructions fields; `MCP` and `Skills` hold one grant picker each (see `capabilities.md`).
- The active tab is marked and the modal starts on `General`; switching tabs keeps pending edits in every tab (`../ui/unsaved-changes.md` allows it because one form spans them). The modal's Save writes name, instructions and both grant sets in one request; Delete stays in the modal footer.
- Opening a modal focuses the name field once; afterwards focus and caret stay wherever the user put them, including while other fields are edited.
- Stored per role: name (required), instructions (required). CRUD via `/api/roles`.
- A bot's detail view assigns its role from a picker; assigning or switching applies to subsequent runs — clearing sets it back to none. Deleting a used role unsets it on those bots.
- Prompt assembly order is defined in `../bots/registry.md`.
