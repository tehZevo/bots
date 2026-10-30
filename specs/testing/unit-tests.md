# Unit tests

- `pnpm test` runs the unit suite from the repo root; server and CLI packages use Node's built-in test runner (`node --test` with tsx) and `packages/web` uses vitest (`pnpm test:web`, node environment with jsdom booted per test file where needed); no Docker daemon and no LLM calls are required or made — external HTTP is faked at the fetch level.
- Server tests live in `packages/server/test/*.test.ts`, named after the module under test; pure logic first: trigger payload validation and schedule parsing, webhook auth semantics (401/404/409/413), provider registry default/model rules, MCP JSON-RPC message framing against a fake stdio child, task/status tool behavior.
- Web tests live in `packages/web/test/*.test.ts`, named after the module under test, exercising pure helpers (formatting, rng, names) and rendering components via `react-dom/server` or, for interactive flows, `jsdom`; no real backend or network is required. Each test imports only its module under test and that module's own dependencies — never through an application shell to reach a helper; anything unreachable without the shell moves into an importable module first.
- CLI tests live in `packages/cli/test/*.test.ts`, named after the command or helper under test; they use a temp config path and drive the Hono app in-process for auth, device-flow and command-to-route mapping, with polling faked by timers.
- Every test gets an isolated temp `DATA_DIR`/`DATABASE_PATH`; the suite never touches `./data`, host Docker or real provider keys.
- API-level tests drive the Hono app in-process (no listening socket) and assert on status codes and JSON bodies as specced.
- CI gates every pull request — typecheck, tests and per-package coverage floors (`testing/ci.md`) run as separate status checks.
- The suite must pass locally before an implementation PR merges too; a failing test is fixed by changing code or the spec, never by deleting the assertion without a spec change.
