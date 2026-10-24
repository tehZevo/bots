# External coding agents

A bot runs on a pluggable engine: the built-in pi loop (default) or a third-party headless CLI agent (opencode, Claude Code, …) executed inside the bot's own container. The engine is chosen per bot and stored as `engine` (`pi` default).

- Engine selection lives in the bot editor under General; changing it affects only subsequent runs, never history already recorded.
- An external run spawns the CLI in print mode over container exec in `/workspace`: Claude Code uses `claude -p <prompt> --output-format stream-json`, opencode uses `opencode run --format json`; each emits newline-delimited JSON events on stdout.
- The adapter parses those events into the same message/run shape as pi: assistant text, tool calls and results append to chat identically regardless of engine; a run still ends only in `ok` or `error`.
- Role/system prompt is bridged to the CLI's system-prompt flag (`--system-prompt`/`--append-system-prompt` for Claude, opencode's equivalent); role MCP servers are written into `/workspace/.mcp.json` before spawn.
- The CLIs are pre-installed in the sandbox image; nothing installs at run time. Provider keys reach the CLI only as exec environment variables (never persisted to files or baked into the image).
- External agents keep their own session state in-container: the bot stores a per-engine session id and resumes with `--resume`/`-s`; when resume is unavailable it falls back to injecting the SQLite transcript.
- A headless CLI cannot be steered mid-run, so messages injected during an active external run queue and start as the next run; they never kill-and-restart the CLI.
- Interrupting a bot kills the spawned CLI process (and its children) inside the container and records the run `interrupted`; the container itself stays up.
