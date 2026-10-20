# CLI output and exit codes

- Human output is the default: lists render aligned tables, single resources render key/value lines, and mutations print the created or changed ids plus key fields.
- `--quiet` prints only ids, one per line, and suppresses headings and progress. Secret-returning commands still print the secret because it is the result. It is the scripting contract while no structured JSON output exists.
- `--no-color` and `NO_COLOR` disable ANSI styling; when stdout is not a TTY, tables degrade to tab-separated text.
- Normal results go to stdout. Progress, warnings and errors go to stderr.
- `--verbose` adds method, URL, status and the server error body, but never auth headers, webhook secrets or passwords.
- Exit codes are `0` success, `1` network or 5xx or unexpected, `2` usage or validation or ambiguous reference, `3` authentication or authorization, `4` not found, and `5` conflict.
- HTTP 400 and 422 map to 2, 401 and 403 to 3, 404 to 4, 409 to 5, 413 and 429 to 1, and all other statuses to 1.
- Errors print one line as `bots: <message>`; stack traces appear only with `--verbose` or `BOTS_DEBUG=1`.
- `run now --follow` and `run logs --follow` write progress to stderr and final output to stdout so redirection captures results.
