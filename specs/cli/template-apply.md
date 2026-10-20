# CLI template apply

- `bots template apply <template> --name <new-bot> [--no-triggers] [--dry-run]` creates a bot from a template and copies its starter triggers.
- It resolves the template by unique name or id, then posts to `/api/bots` with the template's instructions, machine id and role id plus the required new name; the template itself is unchanged.
- Unless `--no-triggers`, it creates each templated schedule trigger through `POST /api/bots/:id/triggers`. Webhook triggers cannot be templated and are never invented.
- The command prints the new bot id first, then each created trigger id.
- If trigger creation fails after the bot exists, the bot and any earlier triggers remain. The CLI exits 1, names the created bot id, and reports the failing trigger.
- `--dry-run` prints the bot payload and trigger list without sending anything.
- Template references accept unique names or ids; ambiguity exits 2. Duplicate bot names are not rejected locally and surface the server response.
- Applying a template whose machine or role was deleted surfaces the server's validation error without creating a bot.
