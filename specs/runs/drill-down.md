# Run drill-down

- Each `Logs` row (`../bots/detail.md`) opens an inline expansion below it — one run's transcript replay; there is no second log surface and the chat sidebar is unchanged (`../chat/sidebar.md`).
- Every persisted message row (user, assistant, tool call, tool result) carries the id of the run that produced it; steers show inside the run they merged into (`lifecycle.md`).
- The expansion renders chronologically: injected user messages, each assistant turn, then each tool call with its argument summary and output; outputs truncate like other tool views with expand-on-tap.
- User-message steps expose `Run this` to replay that injection as a fresh run (`rerun.md`).
- Tool results display exactly as persisted — already redacted (`../secrets/redaction.md`); the replay adds no second redaction pass.
- Each step shows its timing: per-turn wall time where recorded, retry waits marked (`../llm/retry-backoff.md`); the header repeats status, source and token totals from the row.
- Runs predating message linkage show a muted “transcript not recorded” line; deleting a run deletes its linked rows with it.
- API: `GET /api/bots/:id/runs/:runId/transcript` returns the ordered steps for any signed-in user (`../auth/multi-user.md`).
