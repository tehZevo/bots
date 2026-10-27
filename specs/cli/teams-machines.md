# CLI team and machine commands

- `team list|get|create|update|delete` map `/api/teams`; create requires `--name`, teams resolve by unique name or id, rename uses `--name`, and delete is confirmed without touching member bots.
- `team member set <team> <bot> [--leader|--no-leader]` maps `PUT /api/teams/:teamId/members` and is an upsert; omitting both flags clears leadership. `team member remove <team> <bot>` maps DELETE. Both print the full updated team.
- Adding an unknown bot surfaces 400; removing a non-member surfaces 404.
- `machine list|get|create|update|delete|rebuild|repull` map `/api/machines`; flags are `--name`, `--description`, `--dockerfile`/`--dockerfile-file`. Create requires name and Dockerfile.
- `machine get` lists and filters because the API has no single-machine route; the built-in `default` machine is always listed.
- The default machine cannot be updated or deleted. `machine repull` maps `POST /api/machines/default/repull` and prints the resulting image.
- `machine rebuild <machine>` maps `POST /api/machines/:id/rebuild`, prints the returned row, and exits 1 when `build_error` is set.
- Deleting a machine still referenced by bots returns 409 listing them; the CLI exits 5 and prints the server message.
- `bot teams <bot>` lists `GET /api/teams` and filters teams whose members include that bot, printing each team id, name and membership `leader` flag.
