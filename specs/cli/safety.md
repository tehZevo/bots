# CLI destructive actions

- Destructive commands are `bot delete`, `message clear`, `trigger delete`, `trigger rotate-secret`, `template delete`, `project delete`, `role delete`, `team delete`, `team member remove`, `skill delete`, `mcp delete`, `machine delete`, `provider delete` and `key revoke`.
- `bot restart-machine` is confirmed because it interrupts a live run and recreates the container. `run interrupt` is not confirmed because it is the emergency stop.
- On a TTY the CLI asks for confirmation naming the target and, when useful, the effect; the default answer is no, and anything other than an explicit yes aborts with exit 1.
- When stdin is not a TTY, confirmation-required commands fail without sending a request and tell the caller to pass `--yes`.
- `--yes` skips confirmation on every destructive command; it is never implied by `--quiet`, by redirection or by any other flag.
- Idempotent or reversible actions such as marking notifications read and enabling or disabling bots do not prompt.
- Secret-returning actions (`trigger create --kind webhook`, `trigger rotate-secret`, `key create`) print the secret once to stdout and never include it in later list or get output.
- Only auth commands prompt for credentials and destructive commands confirm; every other command is non-interactive so agents and cron never block.
