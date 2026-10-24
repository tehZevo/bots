# CLI bot, run and message commands

- `bots bot list|get|create|update|delete|restart-machine|teams` wrap `/api/bots`; `list`/`ls`, `create`/`new`, `update`/`edit` and `delete`/`rm` are aliases. List columns are id, name, health, run state, role, machine and enabled.
- `bot create` requires `--name` unless `--file` supplies the body. Flags are `--instructions`, `--instructions-file`, `--model`, `--role`, `--machine`, `--avatar-shape`, `--avatar-color`, `--sound`, `--disabled` and repeatable `--project`; body keys match `BotInput`. `--file` is mutually exclusive with field flags.
- `--project` is applied with a follow-up PATCH because bot creation does not accept `project_ids`; a failure there leaves the bot created and reports its id.
- `bot update <bot>` sends only the fields supplied. `--enable`, `--disable`, `--clear-role`, `--clear-machine`, `--clear-model` and `--clear-projects` cover enabled/null transitions; repeatable `--project` replaces the attached set; `--file -|path` overrides flags.
- `bot get <bot>` prints the bot including `project_ids`; `bot teams <bot>` lists `/api/teams` and filters memberships because there is no single-bot teams route. Both accept a bot name or id.
- `bot delete <bot>` is confirmed per `safety.md`; `bot restart-machine <bot>` is confirmed and interrupts any live run.
- `bots run now <bot> [--message TEXT|--message-file FILE] [--follow] [--timeout 30m]` maps `POST /api/bots/:id/run`, prints `runId` and `steered`, and uses the server's default message when none is supplied.
- `run now --follow` polls `GET /api/bots/:id/runs` every 2 seconds, backs off on errors, and stops when that run is `ok`, `error` or `interrupted`, then prints its output or error. Ctrl-C exits 0 and leaves the run active; timeout exits 1.
- `run list <bot> [--limit N]` prints newest-first runs with id, status, start time, trigger and output preview; `run show <bot> <runId>` filters that list; `run logs <bot> [--follow]` prints terminal runs, then polls for new ids until Ctrl-C exits 0. An unknown run exits 4.
- `run interrupt <bot>` maps `POST /api/bots/:id/interrupt`, prints `stopped`, and is not confirmed because it is the emergency stop.
- `bots message list <bot> [--limit N]` maps GET, `message send <bot> (--text|--file)` maps POST and prints `runId`/`steered`, and `message clear <bot>` maps DELETE and is confirmed.
- Sending to a disabled bot returns the server's 409 unchanged; clearing memory resets runtime state exactly like the UI action.
