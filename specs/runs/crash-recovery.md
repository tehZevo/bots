# Crash recovery

Runs are durable: every turn, tool call, and piece of run state is committed to storage (pi-durable) before it is surfaced, so a process death mid-run loses nothing already committed.

- Each model turn, tool call, and injected message is committed before its output is streamed; the `runs` row reflects committed state (`committed`/`ok`/`error`), never a bare in-memory assumption.
- On boot the server reopens the pi-durable store and resumes or finalizes every run left mid-flight; no run stays `running` forever and no sweep heuristic is needed (replaces the stale-row caveat in `lifecycle.md`).
- A resumed run continues from its last committed turn with full context — partial assistant text, pending steers, and prior tool results are intact; nothing already committed replays.
- Side-effecting tools are not replayed after resume; a run that dies between committing a tool call and executing it records the gap as `error` with the partial output kept (see `lifecycle.md` for output rules).
- MCP connections are per-process: on resume they reconnect fresh; sessions from the dead process are dropped, never restored.
- Resume is silent to end users — resumed runs appear in run history (`GET /api/bots/:id/runs`) like any other, newest first.
