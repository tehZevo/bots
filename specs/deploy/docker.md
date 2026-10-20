# Dockerized orchestrator

The orchestrator ships as a single self-contained container image bundling the Hono server and the built Vite UI, runnable as one container.

- The image exposes the API/UI on `PORT` (default `8075`) and is intended to be deployed via a single-service `docker compose` file with one mounted volume for the SQLite database (`data/bots.db`).
- Runtime configuration comes from environment variables: `PORT`, `DATA_DIR`/`DATABASE_PATH`, `SANDBOX_IMAGE` (defaults mirror `.env.example`). Model settings live in the provider registry, not env vars (see `../llm/providers.md`). Missing required values fail fast at startup.
- `GET /api/health` returns `{ ok: true }` for container health checks.
- The SQLite database persists across restarts via the mounted volume; the container recreates lazily and rebuilds its schema on boot.
- The bot sandbox image (`SANDBOX_IMAGE`, default `ghcr.io/<owner>/bots-sandbox:latest`) is referenced by the orchestrator, which mounts the docker socket so it can lazily create and reuse per-bot sandbox containers via `docker run`/`docker exec`, alongside the data volume and an outbound network.
- Before first use the orchestrator checks the configured image exists locally (`docker image inspect`) and transparently pulls it when missing; a failed pull fails only that bot's run with a clear error, never crashes the loops of other bots.

See also: `../machines/sandbox.md`, `../bots/registry.md`.
