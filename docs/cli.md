# CLI basics

`bots` drives the REST API with server-side permissions, validation and errors; it never reads SQLite directly.

## Configuration

One server is stored per install in `$XDG_CONFIG_HOME/bots/config.json` (`%APPDATA%` on Windows), with restrictive permissions; `--config` relocates it. The file stores the URL, email, API key and key metadata. Flags override environment variables, which override the file:

```bash
BOTS_URL=https://bots.example.com
BOTS_API_KEY=bots_…
```

URLs must be absolute. HTTPS is required except for `localhost`, `127.0.0.1` and `::1`; use `--insecure` only when you intentionally accept plain HTTP elsewhere.

## Authentication

```bash
bots auth login --url https://bots.example.com
```

The CLI requests an eight-character code, opens the browser approval page when possible, waits for approval and stores the returned API key — [Accounts & access](/authentication#sign-in-from-a-terminal-device-login) describes what you see in the browser. Use `--web` explicitly for the browser flow or `--no-browser` to force print-only mode; terminal password login and a pasted `--api-key` are mutually exclusive with device login.

`bots auth status` checks configuration without exposing credentials. `bots auth logout` removes the local config and, by default, revokes its stored key first; pass `--keep-key` to retain it for another install.

## Common commands

Most resources accept either an exact id or a unique case-insensitive name; triggers, runs, messages and API keys are referenced by id:

```bash
bots health
bots bot list
bots run now review-bot --message "Summarize open PRs" --follow
bots message send ops-bot --text "Check the deployment queue"
bots trigger create review-bot --message "Review changes" --schedule "@every 30m"
bots api GET /api/health
```

Use `--help` at any level to see supported verbs and flags. Update commands send only supplied fields; a repeatable collection replaces its stored collection when present and leaves it unchanged when omitted. Flags ending in `--*-file` accept `-` to read from stdin.

## Safety, output and exit codes

Destructive commands confirm on an interactive terminal by default. When stdin is not a TTY, they refuse until you pass `--yes`; no other flag implies confirmation. Secrets returned once — webhook secrets, API keys and rotated values — appear only in their creating command’s result.

Human output uses tables for lists and key/value lines for records; `--quiet` emits ids or essential results one per line for scripting, with progress/errors on stderr and normal results on stdout.

| Exit code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Network failure, server error or unexpected condition |
| 2 | Usage/validation problem or ambiguous reference |
| 3 | Authentication or authorization failure |
| 4 | Resource not found |
| 5 | Conflict |
