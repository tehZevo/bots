# Confirmation dialogs

- Every destructive action asks for confirmation before it executes: Delete bot, role, machine, template, skill, MCP server, trigger or team; Clear memory; secret rotation.
- The dialog names the affected object ("Delete bot Atlas?" / "Clear the stored context of Atlas?") and offers a confirm button plus Cancel; Escape and outside taps mean Cancel.
- Confirmation renders above any open modal (the detail or role modal stays behind it); nothing is sent to the API until confirm.
- The confirm button of a destructive action is styled danger (red accent), never the default accent; Cancel keeps neutral styling.
- The unsaved-changes dialog (`unsaved-changes.md`) follows the same overlay and Escape/outside rules; its discard action is danger, but it is local-only and never sends a request.

