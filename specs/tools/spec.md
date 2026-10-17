# Tools

Built-in tools available to every bot each run; roles/skills/MCP will extend this surface later.

- `web_fetch(url)` — GET, returns status + body as text (HTML stripped). 30 s timeout, output capped at 8k chars.
- `shell(command)` — `bash -lc` inside the bot's workspace `data/workspaces/<bot-id>/`. 60 s timeout, exit code + stdout/stderr, 8k cap. Not sandboxed yet.
- Workspaces persist across runs; not deleted with memory or (yet) with the bot.
