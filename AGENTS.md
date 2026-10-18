# AGENTS.md — working in this repo

## Layout

- `packages/server` — Hono API, scheduler, agent loop (`src/agent.ts`), SQLite layer (`src/db.ts`), tools (`src/tools.ts`).
- `packages/web` — React + Vite UI; talks to `/api` (dev proxy → `:8787`).
- `specs/` — behavior specs: a directory per feature/behavior-set; each markdown file is named after the behavior it describes (e.g. `specs/tools/shell.md`) — never generic names like `spec.md`. Specs describe the **current target behavior** of the application, present tense, ~20 lines max; features not fully defined yet live in root `ROADMAP.md`, never in specs.
- `OPEN_QUESTIONS.md` — judgement calls baked into the implementation that need a deliberate decision, each with a recommended lean. Resolving one = update spec + code, then delete the entry.

## Specs workflow

- Specs are the source of truth for behavior.
- Specs never reference PR/issue numbers — state behavior alone, present tense.
- When a new behavior is agreed on, open a **spec-only PR** touching just `specs/**`.
- Implementation happens in separate code PRs that reference the spec they implement.
- Behavior changes require a spec update in the same or an earlier PR than the code change.

## Pull requests

- UI changes: attach **light-mode, dark-mode, and one mobile-width (390px) screenshot** to the PR when able.
- Attach those screenshots to the main PR description (`gh pr edit --attach`), not as separate comments; on later UI changes update the existing attachments in place by re-editing the body.

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
- Agent LLM access goes through `@earendil-works/pi-*` v1.x: stream via `streamSimple` from `@earendil-works/pi-ai/api/openai-completions`, agent state is set with `initialState`, and `systemPrompt` on the live agent state is read-only. Inject into a busy loop with `agent.steer()` (see `injectMessage` in `agent.ts`).
- Trigger firing and message injection are fire-and-forget; every run row must reach a terminal status (`ok`/`error`) — keep the try/catch/finally around the loop in `agent.ts` intact.

## Testing without CI

Smoke test manually: start server with `.env`, `POST /api/bots` (name only), `POST /api/triggers`-style nested create `/api/bots/:id/triggers` with message "Reply with exactly PONG" and `@every 1m` (or just `POST /api/bots/:id/run` with that message), then poll `GET /api/bots/:id/runs` for `status: ok`.
