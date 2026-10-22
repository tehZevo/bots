# MCP child process environment

- A stdio MCP server is spawned on the orchestrator host, not inside a bot sandbox, with an explicit environment allowlist — never a spread of the orchestrator's own `process.env`.
- Baseline inherited vars are `PATH` and the orchestrator's own `HOME`; no other host variable reaches a child by default.
- Each server row carries its own declared key/value pairs (see `servers.md`); those are injected into that child alone, verbatim, at spawn time, and a declared key overrides the baseline for the same name.
- Host variables the orchestrator holds for itself — `DATABASE_PATH`, `DATA_DIR`, deployment tokens — are not inherited, so a server that prints its environment does not push them into tool output.
- A declared key with an empty value spawns with that variable set to the empty string; declaring a key is what exposes it, not giving it a value.
- The orchestrator authenticates upstream providers itself; an MCP child receives a provider credential only when its own row declares it.
- The environment snapshot is read at spawn time: a run already in flight keeps its snapshot, and the next run that uses the server picks up edited rows.
- `Test connection` builds the same environment as a real spawn, so handshake results reflect production env.
- The allowlist narrows what a child inherits, not what it can reach: a server still runs with the orchestrator's filesystem and network access.
