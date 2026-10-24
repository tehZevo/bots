# Crash recovery

Model turns, tool calls, and injected messages are committed to durable storage before they are surfaced, so a process death preserves committed work and its context.

- Durable commits are internal: a run stays `running` until it ends `ok` or `error`.
- On boot, the server resumes runs that have resumable durable work. Runs with none — legacy rows, tasks parked after repeated crashes, or failed storage — end `error` with a clear reason. No run stays `running` forever.
- A resumed run continues from its last committed checkpoint with committed messages, tool results, and pending steers intact; committed work does not replay.
- Side-effecting tools are not replayed. An interrupted tool call becomes an `interrupted` tool result; a run that cannot continue ends `error` with partial output kept (`lifecycle.md`).
- MCP sessions are per-process: after resume they reconnect fresh; dead-process sessions are never restored.
- Resume is silent: resumed runs appear in run history (`GET /api/bots/:id/runs`) like any other.
