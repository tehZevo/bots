# Continuous integration checks

- Every pull request and push to master runs four independent, individually named status checks — `ci / typecheck`, `ci / tests`, `ci / coverage` and `ci / build` — so reviewers can tell at a glance which stage broke instead of reading one combined CI failure. A pull request whose diff touches only `specs/**` skips the code checks entirely; spec changes need nothing to compile, and anything uncertain (empty diffs, pushes) still runs them.
- Each check reports only its own stage: typecheck compiles all workspace packages; tests runs the unit suite without coverage overhead; coverage runs each package's suite with V8 coverage, enforces the per-package floor and annotates the check summary with the measured percentage even on success.
- `ci / build` produces the production artifacts (`pnpm build`, all packages) so packaging breaks surface on the PR; developers verify locally with typecheck and tests only, building themselves just when a running artifact or screenshots require it.
- Coverage is gated per package: server and web floors are 80% lines; the CLI package starts at a 70% floor until its command surface settles.
- Checks never require a Docker daemon, provider keys or network LLM calls (`testing/unit-tests.md` isolation rules apply).
- A failing check blocks merge like any required status; waivers (e.g. a temporarily lowered coverage floor) are expressed in the workflow file with a comment.
