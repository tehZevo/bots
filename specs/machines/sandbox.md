# Bot sandbox

One bot = one container: all agent shell execution happens inside the bot's own Docker container, never on the host.

- Each bot has a dedicated long-lived container named `bots-bot-<bot-id>` from the default sandbox image (bash, coreutils, git, GitHub CLI (`gh`), curl; built from `docker/sandbox/Dockerfile`), created lazily on first shell use and reused across runs and server restarts.
- The bot's workspace `data/workspaces/<bot-id>/` is bind-mounted as `/workspace` — the only host mount — and is the working directory of every command.
- No secrets passthrough: container env carries only a minimal PATH/HOME; server variables (`LLM_API_KEY` etc.) never reach agent commands.
- Network: outbound via bridge (git, curl, and gh reach the network); no inbound ports, no volume of host docker socket.
- Docker is the only runtime; no provider abstraction layer sits in front of it.
- Idle reaping: a container with no run activity for the configured idle timeout (default 5 minutes) is stopped and removed; the next shell use recreates it lazily. The timeout is a server-wide setting edited in Settings (see `../settings/preferences.md`); a bot mid-run is never reaped.
- Restarting a bot's machine interrupts any live run, then stops and removes its container immediately; the next shell use recreates it lazily from the currently selected machine image. `/workspace` and database history persist, while anything installed or written outside `/workspace` disappears.
- Deleting a bot removes its container and keeps the workspace directory. Interrupting a bot kills the running command inside the container but leaves the container up.
- If the container cannot start, the shell tool surfaces the error to the agent as a tool failure — runs still reach a terminal status (see `../runs/lifecycle.md`).
