# AGENTS.md — working in this repo

## Layout

- `packages/server` — Hono API, scheduler, agent loop (`src/agent.ts`), SQLite layer (`src/db.ts`), tools (`src/tools.ts`).
- `packages/web` — React + Vite UI; talks to `/api` (dev proxy → `:8787`).

## Commands

- Install: `pnpm install`
- Dev: `pnpm dev` (server tsx watch on 8787 + vite on 5173)
- Typecheck: `pnpm -r typecheck` — must pass before committing
- Build: `pnpm build`; run built server with `pnpm start`
- Lint/format: `pnpm exec biome check --write .`

## Conventions

- NodeNext ESM everywhere; relative imports in the server include the `.ts` extension (`rewriteRelativeImportExtensions` handles emit).
- Keep secrets out of git: env lives in `.env` (gitignored); never commit real keys or base URLs.
- `better-sqlite3` is a native dep — if bindings are missing after install, run its install script inside the pnpm store dir (`prebuild-install || node-gyp rebuild --release`).
- Agent LLM access goes through `@earendil-works/pi-*` v1.x: stream via `streamSimple` from `@earendil-works/pi-ai/api/openai-completions`, agent state is set with `initialState`, and `systemPrompt` on the live agent state is read-only.
- Scheduler runs are fire-and-forget; every run row must reach a terminal status (`ok`/`error`) — keep the try/catch/finally in `scheduler.ts` intact.

## Testing without CI

Smoke test manually: start server with `.env`, `POST /api/bots` with task "Reply with exactly PONG", then `POST /api/bots/:id/run` and poll `GET /api/bots/:id/runs` for `status: ok`.
