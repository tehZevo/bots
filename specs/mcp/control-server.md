# Control MCP server

- The orchestrator exposes an MCP server that mirrors what the UI can do: list bots, create a bot, read and set its role, trigger a run now, interrupt a loop, read recent runs and logs.
- Transport is streamable HTTP under `/mcp` on the existing port; authentication uses API keys (`api/rest-keys.md`) so an external agent acts as its owner with the same visibility rules.
- Tool names are flat verbs (`bots_list`, `bot_create`, `run_now`, `runs_tail`, …); arguments and results reuse the REST JSON shapes unchanged — one contract, two doors.
- The server never bypasses existing guards: creating bots honors name validation, runs honor enabled/blocked state, and every mutation appears in the UI immediately like any other client action.
- Enabling or disabling the control endpoint is a Settings toggle available to any signed-in user; disabled means `/mcp` returns 404.
