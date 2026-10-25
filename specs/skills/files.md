# Skill file access

- Granted skills are advertised rather than injected: the effective system prompt lists each granted skill by name, description and id, and the model loads a skill's instructions only when the task matches; full instruction text no longer sits in the prompt unconditionally.
- The advertisement is rebuilt at run start from the role's grants and ordered by skill name so equal grants produce identical prompts; a run already in flight keeps the grant set it started with (`../roles/capabilities.md`). With nothing granted, the section is absent entirely.
- `read_skill_file` is how a model loads a skill: it takes the id of a granted skill and an optional path inside that bundle (default `SKILL.md`) and returns the file text; ungranted ids, paths escaping the bundle and directories are rejected as tool errors, and oversized files truncate like other tool output.
- The tool is present for every bot with at least one granted skill and absent otherwise; it is not a separately grantable capability (`../roles/capabilities.md`).
- Reading is read-only: it never mutates a skill, its grants or the run's status, and a failed read ends as tool output rather than failing the run.
- Bots whose role grants `shell` also get each granted bundle copied into their sandbox at `/workspace/.skills/<skill-name>/` when the loop starts — refreshed whenever the stored bundle changes and removed when the grant goes away — so instructions that reference bundled scripts resolve against that directory; for those bots the advertisement names this path.
- Bots without `shell` see only name, description and id: they can read skill files but cannot execute bundled scripts.
- Advertised descriptions and file contents are untrusted text: they guide the model and grant it nothing.
- Hand-written skills follow exactly the same rules as imported ones (`import.md`) — one advertisement, one reader.
