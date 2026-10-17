# Dockerized orchestrator

The orchestrator ships as a single self-contained container image bundling the Hono server and the built Vite UI — it runs as one container, not `pnpm dev`.

- The image exposes the API/UI on `PORT` (default `8787`) and is intended to be deployed via a single-service `docker compose` file with one mounted volume for the SQLite database (`data/bots.db`).
- Runtime configuration comes from environment variables: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `PORT`, `DATA_DIR`/`DATABASE_PATH`, `SANDBOX_IMAGE` (defaults mirror `.env.example`). Missing required values fail fast at startup.
- `GET /api/health` returns `{ ok: true }` for container health checks.
- The SQLite database persists across restarts via the mounted volume; the container recreates lazily and rebuilds its schema on boot.
- The bot sandbox image (`SANDBOX_IMAGE`, default `bots-sandbox:latest`) is built separately and referenced by the orchestrator; the docker socket is not mounted into the orchestrator.

See also: `bots/sandbox.md`, `bots/registry.md`.
