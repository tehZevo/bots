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

Model providers and their API keys are stored in application settings, not environment variables. Optional LLM request caps (`LLM_CONTEXT_WINDOW`, `LLM_MAX_TOKENS`) and compaction controls (`COMPACTION_TOKEN_THRESHOLD`, `COMPACTION_RATIO`, `COMPACTION_KEEP_RECENT`) tune runtime behavior without storing credentials.

`GET /api/health` returns a minimal successful health response and is suitable for container health checks. Sandbox images are checked when first needed and pulled transparently if absent; a failed pull fails the affected bot run rather than stopping other bots.

## Docker socket security

To create and reuse per-bot sandbox containers, the orchestrator needs access to the host’s Docker daemon — conventionally by mounting `/var/run/docker.sock`. Treat that mount as an administrative capability: the server can start, stop and remove containers on the host through its built-in Docker client.

Keep the orchestrator on a trusted network or behind an authenticated reverse proxy. Do not expose port `8075` directly to the public internet without TLS and access control; API keys and login sessions protect application actions but do not replace network hardening for the deployment itself. If bot shell execution is unavailable, check first that the socket mount exists and is accessible to the container runtime.

## Backup and restore

All durable application state lives under `$DATA_DIR`: `bots.db`, SQLite write-ahead-log files (`bots.db-wal` and `bots.db-shm`) and the per-bot `workspaces/` directory. Bots, settings, roles, runs, credentials metadata and other records are all stored in that database.

For a reliable cold backup:

1. Stop the orchestrator so SQLite checkpoints its WAL and no workspace writes remain open.
2. Copy the entire data-directory or Docker volume to durable storage.
3. Restart the orchestrator.

Restore by stopping the server, replacing the target directory with the saved contents while preserving ownership and permissions, then starting it again. A running-service file copy may capture SQLite mid-transaction and should not be treated as a consistent backup. Dedicated configuration-only JSON export is not currently available; application settings are included in the full data-directory backup above.
