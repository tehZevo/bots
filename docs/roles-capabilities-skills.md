# Roles, skills & capabilities

A **role** is a reusable bundle: instructions appended to every assigned bot's prompt, plus granted capabilities. Assign bots to roles from their General tab; a bot with no role just uses its own prompt and the baseline tools.

## Skills

Skills are markdown playbooks — "how the team writes commit messages", "our deploy runbook". Create them in the **Skills** tab (name + description + instructions). Granted skills are advertised rather than injected: a bot's system prompt only lists each granted skill by name, description and id (ordered by name), and the model loads a skill's text on demand with its `read_skill_file` tool (defaults to `SKILL.md`; other files inside the bundle work too). The tool exists whenever at least one skill is granted; ungranted ids, paths escaping the bundle and directories come back as tool errors. Bots also get each granted bundle copied into their sandbox at `/workspace/.skills/<skill-name>/` when a loop starts — refreshed when the skill changes, removed when the grant goes away — so instructions that reference bundled scripts just work. Skill text is untrusted: it guides the model and grants it nothing.

### Importing skills

The Skills tab also imports ready-made skills. **Import** opens a dialog where you either search [skills.sh](https://skills.sh) by name/keyword and press *Use* on a result, or paste a Git source directly — `owner/repo`, a repository URL with an optional `/tree/<ref>/<path>` subpath, an optional `@<skill>` filter and an optional `#<branch|tag|commit>` pin (unpinned sources follow the repository's default branch). **Preview** resolves the source read-only: every discoverable `SKILL.md` is listed with its name, description, license, file count, size and content hash plus the resolved commit. Select one, several or all and press **Import**: each bundle (`SKILL.md` plus its references, scripts and assets) is stored byte-for-byte on the server, its frontmatter body becomes the skill's instructions, and immutable provenance (origin, source, ref, commit, path, hash, timestamps) is recorded. Imported cards show a `git` badge; hand-written ones show none. Imports are rejected — saving nothing — when the source is unreachable or private, a bundle exceeds 200 files or 5 MB, or a `SKILL.md` lacks a valid frontmatter name/description.

## Capabilities (MCP servers)

Baseline tools (`shell`, `web_fetch`) are always available. Anything richer comes from [MCP integrations](/integrations-mcp): tick the servers a role may use on its **MCP** tab, while skills are granted separately on its **Skills** tab — never in one combined list. Granted servers' tools appear to the agent namespaced as `<server>_<tool>`; if one server is unreachable at loop start it's skipped without breaking the run, and failing tool calls return an error string instead of killing the loop.

Grants reference registry ids — delete a skill or server and dangling grants simply stop taking effect. Unknown ids are rejected with `400` on save.
