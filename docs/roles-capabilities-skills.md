# Roles, skills & capabilities

A **role** is a reusable bundle: instructions appended to every assigned bot's prompt, plus granted capabilities. Assign bots to roles from their General tab; a bot with no role just uses its own prompt and the baseline tools.

## Skills

Skills are markdown playbooks — "how the team writes commit messages", "our deploy runbook". Create them in the **Skills** tab (name + description + instructions). A skill granted to a role is appended to the prompt of every bot wearing that role, after the role's own instructions.

### Importing skills

The Skills tab also imports ready-made skills. **Import** opens a dialog where you either search [skills.sh](https://skills.sh) by name/keyword and press *Use* on a result, or paste a Git source directly — `owner/repo`, a repository URL with an optional `/tree/<ref>/<path>` subpath, an optional `@<skill>` filter and an optional `#<branch|tag|commit>` pin (unpinned sources follow the repository's default branch). **Preview** resolves the source read-only: every discoverable `SKILL.md` is listed with its name, description, license, file count, size and content hash plus the resolved commit. Select one, several or all and press **Import**: each bundle (`SKILL.md` plus its references, scripts and assets) is stored byte-for-byte on the server, its frontmatter body becomes the skill's instructions, and immutable provenance (origin, source, ref, commit, path, hash, timestamps) is recorded. Imported cards show a `git` badge; hand-written ones show none. Imports are rejected — saving nothing — when the source is unreachable or private, a bundle exceeds 200 files or 5 MB, or a `SKILL.md` lacks a valid frontmatter name/description.

## Capabilities (MCP servers)

Baseline tools (`shell`, `web_fetch`) are always available. Anything richer comes from [MCP integrations](/integrations-mcp): tick the servers a role may use on its **Capabilities** tab. Granted servers' tools appear to the agent namespaced as `<server>_<tool>`; if one server is unreachable at loop start it's skipped without breaking the run, and failing tool calls return an error string instead of killing the loop.

Grants reference registry ids — delete a skill or server and dangling grants simply stop taking effect. Unknown ids are rejected with `400` on save.
