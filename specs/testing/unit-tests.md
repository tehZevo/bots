# Unit tests

- `pnpm test` runs the unit suite from the repo root via Node's built-in test runner (`node --test` with tsx); no browser, no Docker daemon and no LLM calls are required or made — external HTTP is faked at the fetch level.
- Server tests live in `packages/server/test/*.test.ts`, named after the module under test; pure logic first: trigger payload validation and schedule parsing, webhook auth semantics (401/404/409/413), provider registry default/model rules, MCP JSON-RPC message framing against a fake stdio child, task/status tool behavior.
- Every test gets an isolated temp `DATA_DIR`/`DATABASE_PATH`; the suite never touches `./data`, host Docker or real provider keys.
- API-level tests drive the Hono app in-process (no listening socket) and assert on status codes and JSON bodies as specced.
- CI gates every pull request — typecheck, tests and an enforcement of the 90% coverage target run as separate status checks (`testing/ci.md`).

- The suite must pass locally before an implementation PR merges too; a failing test is fixed by changing code or the spec, never by deleting the assertion without a spec change.
