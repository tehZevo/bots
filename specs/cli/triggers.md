# CLI trigger commands

- `bots trigger list <bot>` maps `GET /api/bots/:id/triggers` and never prints secrets.
- `trigger create <bot> --message TEXT [--kind schedule|webhook] [--name NAME] [--schedule EXPR]` maps POST. Schedule is the default kind and requires a schedule; webhook forbids one.
- Creating a webhook trigger prints the returned trigger plus the one-time `secret` and `url`. Later list and update output never includes the secret.
- `trigger update <triggerId> [--message ...] [--name ...|--clear-name] [--schedule ...] [--enable|--disable]` maps PATCH and sends only the fields supplied.
- `trigger delete <triggerId>` maps DELETE and is confirmed. `trigger rotate-secret <triggerId>` maps POST, is confirmed, and prints the new secret once.
- `trigger fire <triggerId> (--secret VALUE|--secret-stdin) [--body TEXT|--file FILE]` maps `POST /api/webhooks/:triggerId` using the webhook secret as the Bearer token instead of the CLI API key, and prints the returned run id.
- Webhook firing does not read the config key and works without being logged in; a missing secret exits 2 before sending.
- Triggers are referenced by id. List output includes kind, name, message preview, schedule or url, enabled state and next run time.
- `--kind webhook` with `--schedule` exits 2; an invalid cron or `@every` expression surfaces the server's 400 message.
