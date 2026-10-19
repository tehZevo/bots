# Continuous integration checks

- Every pull request and push to master runs three independent, individually named status checks — `ci / typecheck`, `ci / tests` and `ci / coverage` — so reviewers can tell at a glance which stage broke instead of reading one combined CI failure.
- Each check reports only its own stage: typecheck compiles both packages; tests runs the unit suite without coverage overhead; coverage runs the server suite with V8 coverage, enforces the per-package floor and annotates the check summary with the measured percentage even on success.
- Coverage is gated per package: the server floor is 70% lines; web coverage runs report-only (measured, printed to the summary, never failing) until its suite lands, then it gains its own floor.
- Checks never require a Docker daemon, provider keys or network LLM calls (`testing/unit-tests.md` isolation rules apply).
- A failing check blocks merge like any required status; waivers (e.g. a temporarily lowered coverage floor) are expressed in the workflow file with a comment referencing the spec target of 90%.
