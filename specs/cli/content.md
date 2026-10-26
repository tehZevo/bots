# CLI project, role, skill, template and MCP commands

- `project list|get|create|update|delete` map `/api/projects`; flags are `--name`, `--description`, `--body`/`--body-file`. Create requires non-empty name and body; update sends only supplied fields; project references accept a unique name or id.
- `role list|get|create|update|delete` map `/api/roles`; flags are `--name`, `--instructions`/`--instructions-file`, repeatable `--mcp-server` and `--skill`. Create requires name and instructions; references resolve to ids before sending; update sends only supplied fields.
- `skill list|get|create|update|delete` map `/api/skills`; create requires name and instructions; update sends only supplied fields.
- `template list|get|create|update|delete` map `/api/templates`; create requires `--name`; flags are `--description`, `--instructions`/`--instructions-file`, `--machine`, `--role` and repeatable `--trigger '{"message":"...","schedule":"..."}'`; duplicate names return the server's 409.
- `template apply <template> --name <new-bot> [--no-triggers] [--dry-run]` resolves the template by unique name or id and posts to `/api/bots` with its instructions, machine id, role id and the new name; the template itself is unchanged. A deleted machine or role surfaces the server's validation error without creating a bot; duplicate bot names are not rejected locally and surface the server response.
- Unless `--no-triggers`, each templated schedule trigger is created through `POST /api/bots/:id/triggers`; webhook triggers cannot be templated and are never invented. Output prints the new bot id, then each created trigger id; if a trigger fails after the bot exists, the bot and earlier triggers remain, exit 1 names them. `--dry-run` prints the payload and trigger list without sending anything.
- `mcp list|get|create|update|delete|test` map `/api/mcp-servers`; create requires `--name` and `--command`; flags include repeatable `--arg`, repeatable `--env KEY=VALUE`, and `--enable`/`--disable`.
- `mcp test <server>` maps `POST /api/mcp-servers/:id/test` and prints the discovered tool count, or the failure with exit 1.
- MCP env values are accepted only as `KEY=VALUE`; malformed pairs exit 2. List output masks env values.
- `get` for resources without a single-record endpoint lists and filters: zero matches exit 4, multiple matches exit 2 with candidates.
