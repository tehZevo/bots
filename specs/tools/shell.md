# shell

- Runs `bash -lc <command>` on the host with the server's permissions; cwd is the bot's workspace `data/workspaces/<bot-id>/`.
- 60 s timeout, returns exit code + stdout/stderr, output capped at 8k chars.
- Workspaces are created on demand and persist; deleting a bot leaves its directory in place.
