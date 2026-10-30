# Bot sandbox

One bot = one container: all agent shell execution happens inside the bot's own Docker container, never on the host.

- Each bot has a dedicated long-lived container named `bots-bot-<bot-id>` from the default sandbox image (bash, coreutils, git, GitHub CLI (`gh`), curl; built from `docker/sandbox/Dockerfile`), created lazily on first shell use and reused across runs and server restarts.
- The bot's workspace `data/workspaces/<bot-id>/` is bind-mounted as `/workspace` — the only host mount — and is the working directory of every command.
- Container env carries only a minimal PATH/HOME plus the secrets assigned to that bot (`../secrets/manage.md`); server variables (`LLM_API_KEY` etc.) never reach agent commands.
- Network: outbound via bridge (git, curl, and gh reach the network); no inbound ports, no volume of host docker socket.
- Hardened runtime: containers start as a non-root uid (`--user` set to the workspace owner), with `--cap-drop=ALL`, `--no-new-privileges`, `--pids-limit` 256 and memory/CPU caps, so a compromised sandbox is neither root nor able to fork-bomb or hog the host. Caps are not re-added by machine images; an image needing more runs on a dedicated machine.
- Resource caps (memory default 1 GiB, CPU quota, pid ceiling) are server-wide settings in Settings alongside the idle timeout — one knob set for all sandboxes, no per-bot overrides.
- Docker is the only runtime; no provider abstraction layer sits in front of it.
- Idle reaping: a container with no run activity for the configured idle timeout (default 5 minutes) is stopped and removed; the next shell use recreates it lazily. The timeout is a server-wide setting edited in Settings (see `../settings/preferences.md`); a bot mid-run is never reaped.
- Restarting a bot's machine interrupts any live run, then stops and removes its container immediately; the next shell use recreates it lazily from the currently selected machine image. `/workspace` and database history persist, while anything installed or written outside `/workspace` disappears.
- Deleting a bot removes its container and keeps the workspace directory. Interrupting a bot kills the running command inside the container but leaves the container up.
- If the container cannot start, the shell tool surfaces the error to the agent as a tool failure — runs still reach a terminal status (see `../runs/lifecycle.md`).
