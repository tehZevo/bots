# Roles, skills & capabilities

A **role** is a reusable bundle: instructions appended to every assigned bot's prompt, plus granted capabilities. Assign bots to roles from their General tab; a bot with no role just uses its own prompt and the baseline tools (`shell`, `web_fetch`). Grant changes apply at the next loop start. In the role editor, servers are ticked on the **MCP** tab and skills on the **Skills** tab — never in one combined list. Grants reference registry ids; delete a skill or server and dangling grants simply stop taking effect. Unknown ids are rejected with `400` on save.

## Skills

Skills are markdown playbooks — "how the team writes commit messages", "our deploy runbook" — managed on the **Skills** tab via **+ Add skill**, which opens a modal with **Create** and **Import** tabs. Granted skills work like this:

- A bot's system prompt only advertises each granted skill by name, description and id; the model loads a skill's text on demand with its `read_skill_file` tool (defaults to `SKILL.md`; other files inside the bundle work too). The tool exists whenever at least one skill is granted; ungranted ids, paths escaping the bundle and directories come back as tool errors.
- Each granted bundle is copied into the bot's sandbox at `/workspace/.skills/<skill-name>/` when a loop starts — refreshed when the skill changes, removed when the grant goes away — so instructions that reference bundled scripts just work.
- Skill text is untrusted: it guides the model and grants it nothing.

### Importing skills

On the **Import** tab, search [skills.sh](https://skills.sh) by name/keyword and press *Use* on a result, or paste a Git source directly — `owner/repo`, a repository URL with an optional `/tree/<ref>/<path>` subpath, an optional `@<skill>` filter and an optional `#<branch|tag|commit>` pin (unpinned sources follow the default branch). Then:

1. **Preview** resolves the source read-only — every discoverable `SKILL.md` listed with name, description, license, file count, size, content hash and resolved commit.
2. Select one, several or all and press **Import**; closing the modal or switching to **Create** before this confirmation writes nothing.
3. Each confirmed bundle (`SKILL.md` plus references, scripts and assets) is stored byte-for-byte, its frontmatter body becomes the skill's instructions, and immutable provenance (origin, source, ref, commit, path, hash, timestamps) is recorded. Imported bundles are marked as such; hand-written ones are not.

Imports save nothing — rejecting with an error — when the source is unreachable or private, a bundle exceeds 200 files or 5 MB, or a `SKILL.md` lacks a valid frontmatter name/description.

## Capabilities (MCP servers)

Anything beyond the baseline tools comes from [MCP integrations](/integrations-mcp). Granted servers' tools appear to the agent namespaced as `<server>_<tool>`; if one server is unreachable at loop start it's skipped without breaking the run, and failing tool calls return an error string instead of killing the loop.
