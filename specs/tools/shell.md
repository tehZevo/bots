# shell

- Runs `bash -lc <command>` inside the bot's sandbox container via `docker exec` (see `../machines/sandbox.md`); cwd is `/workspace`.
- 60 s timeout, returns exit code + stdout/stderr, output capped at 8k chars; aborting kills the command in the container.
- Workspace contents persist across runs; the container may be recreated without losing files.
