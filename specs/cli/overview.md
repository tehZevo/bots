# CLI client

- `bots` is a first-class command-line client for the documented REST API (`../api/rest-keys.md`): it uses the same API keys, permissions, validation and error messages, and never reads the database or bypasses the server.
- The client lives in `packages/cli` as the private workspace package `@bots/cli`: TypeScript ESM, Node >= 22, bin name `bots`, argument parsing with `commander`.
- One server per install is stored in `$XDG_CONFIG_HOME/bots/config.json` (fallback `~/.config/bots/config.json`, Windows `%APPDATA%`), directory `0700`, file `0600`, written atomically. Looser existing permissions are warned about and corrected on the next write.
- The config object is `{ url, email, api_key, key_id, key_name }`; no other secret copy exists. `--config` relocates the file for tests and isolated installs.
- Precedence is flag > environment > file: `BOTS_CONFIG`, `BOTS_URL`, `BOTS_API_KEY` override stored values. A missing URL or key exits 3 with a login hint; no command silently targets localhost.
- URLs must be absolute. HTTPS is required except for `localhost`, `127.0.0.1` and `::1`; `--insecure` permits plain HTTP elsewhere and prints a warning to stderr.
- Command groups are `auth`, `bot`, `run`, `message`, `trigger`, `template`, `project`, `role`, `team`, `skill`, `mcp`, `machine`, `provider`, `setting`, `key`, `notification` and `api`; `health`, `openapi` and `version` are top-level.
- References accept an exact id or a unique case-insensitive name. Triggers, runs, messages and API keys use ids only. Unknown or ambiguous references exit 2 and list candidates; the CLI never prompts to disambiguate them.
- `--file` and `--*-file` flags accept `-` to read the value from stdin.
- Update commands send only supplied fields; a repeatable collection flag replaces the stored collection when present and leaves it unchanged when omitted.
- Global flags are `--url`, `--api-key`, `--config`, `--quiet`, `--no-color`, `--verbose`, `--yes`, `--help` and `--version`. There is no structured JSON output flag in this behavior; `--quiet` and `bots api` are the scripting paths.
- `bots version` prints the CLI package version; `bots --version` is equivalent.
