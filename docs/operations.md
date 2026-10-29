# Operations

The orchestrator runs as one container bundling the API server and built web UI. SQLite state, bot workspaces and sandbox containers live outside that process, so upgrades and backups should target the mounted data volume and Docker daemon rather than application files inside the image.

## Runtime configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port served by the container; default `8075` |
| `DATA_DIR` | Directory containing database state and bot workspaces; the image defaults to `/data` |
| `DATABASE_PATH` | Optional full path to the SQLite file; otherwise `$DATA_DIR/bots.db` |
| `SANDBOX_IMAGE` | Default sandbox image referenced by the default machine |
| `ALLOW_REGISTRATION` | Set temporarily to `"true"` when creating accounts, then remove it |
| `DEV_FAKE_LLM` | Set to `"1"` at boot to expose the built-in read-only Fake provider for local development |
| `DEV_SEED_AUTH` | Set to `"1"` for local development only — idempotently seeds `dev@example.com` / `devpassword` plus an API key named `dev`; the full generated value is logged once when created, and existing users or keys are preserved |
| `TRUST_PROXY` | Set `"true"` behind a trusted reverse proxy so rate limits use the first `X-Forwarded-For` hop; otherwise client IP comes from the socket address |
| `LLM_CONTEXT_WINDOW` | Context window assumed for models, default `64000` tokens |
| `LLM_MAX_TOKENS` | Per-request output cap, default `4096` tokens |
| `COMPACTION_TOKEN_THRESHOLD` | Fixed token count that triggers context compaction; unset means compact automatically at `COMPACTION_RATIO` of the model's context window |
| `COMPACTION_RATIO` | Fraction of the context window at which automatic compaction runs, default `0.75` |
| `COMPACTION_KEEP_RECENT` | Most recent messages kept verbatim when compacting, default `16` |

Model providers and their API keys are stored in application settings, not environment variables.

`GET /api/health` returns a minimal successful health response and is suitable for container health checks. Sandbox images are checked when first needed and pulled transparently if absent; a failed pull fails the affected bot run rather than stopping other bots.

## Docker socket security

To create and reuse per-bot sandbox containers, the orchestrator needs access to the host’s Docker daemon — conventionally by mounting `/var/run/docker.sock`. Treat that mount as an administrative capability: the server can start, stop and remove containers on the host through its built-in Docker client.

Keep the orchestrator on a trusted network or behind an authenticated reverse proxy. Do not expose port `8075` directly to the public internet without TLS and access control; API keys and login sessions protect application actions but do not replace network hardening for the deployment itself. If bot shell execution is unavailable, check first that the socket mount exists and is accessible to the container runtime.

## Backup and restore

All durable application state lives beside the configured SQLite path (default: `$DATA_DIR/bots.db`): `bots.db`, its write-ahead-log files (`bots.db-wal` and `bots.db-shm`), the Harness recovery database `pi-durable.sqlite` with its own WAL files, and the per-bot `workspaces/` directory. Bots, settings, roles, runs, credentials metadata and other records are stored in `bots.db`; committed agent transcripts, tool calls and durable waits are stored in `pi-durable.sqlite`.

For a reliable cold backup:

1. Stop the orchestrator so SQLite checkpoints its WAL and no workspace writes remain open.
2. Copy the entire data-directory or Docker volume to durable storage.
3. Restart the orchestrator.

Restore by stopping the server, replacing the target directory with the saved contents while preserving ownership and permissions, then starting it again. A running-service file copy may capture SQLite mid-transaction and should not be treated as a consistent backup.

## Configuration backup

For configuration only — portable between installs without run history — Settings → **System** offers **Export config**, which downloads one JSON snapshot of bots (including archived flags), roles, skills with bundles, MCP servers, projects, tags, teams, templates, secret names/keys and API key hashes. Runs, chat history, usage totals, notifications, users, provider values, pause state, workspaces and avatars stay out of the file.

Secret values are omitted by default; flip **Secret values in export** to `Included` only when you intend to carry them in the file. To restore, choose the file and press **Restore config**: the whole upload is parsed and validated before anything is written, then each record is upserted by name without deleting records missing from the backup. New secrets whose values were not included are requested before the import completes; existing values stay unless a value is supplied. Running bots keep their current loop and pick restored state up at their next run. Raw routes: [`/api/backup/config`](/api#configuration-backup).
