# Secrets

- A top-level `Secrets` tab follows the sidebar, drawer, title and icon rules of `../ui/navigation.md`; it lists secrets as cards (name plus the env var key), with an Add/Edit modal and delete behind a confirm dialog (`../ui/confirm.md`).
- A secret record: name (required), key (required env var name — letters, digits and underscores, not starting with a digit) and value (required). Duplicate names or an invalid key return 400 with an error message.
- The value field renders as hidden dots with a show/hide button that reveals it in place; a saved secret is masked again when the modal is reopened, and the value is never sent back to the browser except through that reveal action.
- Secrets are assigned to bots and teams through multiselect pickers: in the bot detail `General` tab (`../bots/detail.md`) and in the team config modal (`../teams/teams.md`). A bot also inherits the secrets of every team it belongs to.
- An assigned secret is injected into that bot's sandbox container as an environment variable named by its key when the container starts (`../machines/sandbox.md`); the bot's own secrets take precedence over an inherited team secret with the same key.
- Secret values never enter the system prompt, a trigger message or the run log; they are visible to the agent only as an environment variable of its own commands.
- Replacing a secret's value is destructive and asks for confirmation first (`../roles/secrets.md`); records persist on the server across restarts and are managed via `/api/secrets`.
