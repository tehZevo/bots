# MCP env secret references

- An MCP server's env row holds either a literal value or a reference to one managed secret (`../secrets/manage.md`); the row stores only the secret's name, never a copy of its value.
- The value input offers a Literal/Secret toggle per row; Secret mode replaces it with a picker over existing secrets — an unknown or deleted name returns 400 on save until repointed.
- At spawn the reference resolves to the secret's current value (`child-env.md`); editing the secret applies to the next spawn without re-saving the server, and deleting a referenced secret yields the empty string for that variable.
- Referenced secrets are redacted from every bot's tool results regardless of the bot's own assignments — the same rule as provider keys (`../secrets/redaction.md`).
- In the UI the row shows masked dots plus a small secret-name badge; `GET` exposes the reference name, never the value, so references survive server export and restore (`../settings/config-backup.md`) with values staying server-side.
- Literal rows behave exactly as before: verbatim injection, plaintext storage behind one volume, revealed only by explicit UI action.
