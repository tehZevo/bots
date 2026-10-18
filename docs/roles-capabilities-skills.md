# Roles, skills & capabilities

A **role** is a reusable bundle: instructions appended to every assigned bot's prompt, plus granted capabilities. Assign bots to roles from their General tab; a bot with no role just uses its own prompt and the baseline tools.

## Skills

Skills are markdown playbooks — "how the team writes commit messages", "our deploy runbook". Create them in the **Skills** tab (name + description + instructions). A skill granted to a role is appended to the prompt of every bot wearing that role, after the role's own instructions.

## Capabilities (MCP servers)

Baseline tools (`shell`, `web_fetch`) are always available. Anything richer comes from [MCP integrations](/integrations-mcp): tick the servers a role may use on its **Capabilities** tab. Granted servers' tools appear to the agent namespaced as `<server>_<tool>`; if one server is unreachable at loop start it's skipped without breaking the run, and failing tool calls return an error string instead of killing the loop.

Grants reference registry ids — delete a skill or server and dangling grants simply stop taking effect. Unknown ids are rejected with `400` on save.
