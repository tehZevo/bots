# Tools

Status: implemented

Bots get a small built-in tool set per run. Future roles/skills/MCP plug into this same surface (planned).

- `web_fetch(url)` — GET an absolute http(s) URL, return status + body as text; HTML/XML is stripped of script/style/tags. 30 s timeout; output truncated at 8 000 chars.
- `shell(command)` — run a command with `bash -lc` inside the bot's private workspace directory (`data/workspaces/<bot-id>/`). 60 s timeout, exit code + stdout/stderr returned, output truncated at 8 000 chars. **Not sandboxed yet** — same host/permissions as the server.
- Each bot's workspace directory is created on demand and persists across runs; it is not deleted with memory or (yet) with the bot.

## Scenarios

- Given shell `echo hi`, Then result text starts `exit 0` and contains `hi`.
- Given a relative path in a shell command, Then it resolves inside the bot's workspace.
- Given web_fetch "example.com" (no scheme), Then the tool errors "URL must start with http:// or https://".
