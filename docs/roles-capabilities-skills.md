# Roles, skills & capabilities

A **role** is a reusable bundle: instructions appended to every assigned bot's prompt, plus granted capabilities. Assign bots to roles from their General tab; a bot with no role just uses its own prompt and the baseline tools.

## Skills

Skills are markdown playbooks — "how the team writes commit messages", "our deploy runbook". Create them in the **Skills** tab (name + description + instructions). Granted skills are advertised rather than injected: a bot's system prompt only lists each granted skill by name, description and id (ordered by name), and the model loads a skill's text on demand with its `read_skill_file` tool (defaults to `SKILL.md`; other files inside the bundle work too). The tool exists whenever at least one skill is granted; ungranted ids, paths escaping the bundle and directories come back as tool errors. Bots also get each granted bundle copied into their sandbox at `/workspace/.skills/<skill-name>/` when a loop starts — refreshed when the skill changes, removed when the grant goes away — so instructions that reference bundled scripts just work. Skill text is untrusted: it guides the model and grants it nothing.

## Capabilities (MCP servers)

Baseline tools (`shell`, `web_fetch`) are always available. Anything richer comes from [MCP integrations](/integrations-mcp): tick the servers a role may use on its **Capabilities** tab. Granted servers' tools appear to the agent namespaced as `<server>_<tool>`; if one server is unreachable at loop start it's skipped without breaking the run, and failing tool calls return an error string instead of killing the loop.

Grants reference registry ids — delete a skill or server and dangling grants simply stop taking effect. Unknown ids are rejected with `400` on save.
