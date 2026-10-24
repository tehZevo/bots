# Skill import

- A skill can be written by hand (`manage.md`) or imported from a source; an imported skill stores the whole bundle — `SKILL.md` plus references, scripts and assets — not only its instruction text.
- Sources: a skills.sh lookup by name or keyword, or a Git source given as `owner/repo`, a repository URL, an optional `/tree/<ref>/<path>` subpath, an optional `@<skill>` name filter, and an optional `#<ref>` branch, tag or commit. An omitted ref means the repository's default branch.
- Import runs in two steps: resolve the source into a preview, then confirm. Resolving lists every discoverable `SKILL.md` with its frontmatter name and description without writing anything; the user selects one, several or all.
- The preview shows, per skill: name, description, source, requested ref, resolved commit, file count, total size, the declared license when present, and the bundle's content hash.
- Confirming stores each selected bundle under the server data directory keyed by a new immutable skill id, resolves name and description from frontmatter, and uses the body as the skill's instructions. Files are stored byte-for-byte.
- Each imported skill records immutable provenance: origin (skills.sh or git), source `owner/repo`, requested ref, resolved commit, folder path inside the source, content hash, and installed and updated timestamps. Changing the source means deleting and re-importing.
- Import rejects, naming the reason and saving nothing: an unreachable, private or unauthenticated source; a bundle over 200 files or 5 MB; a `SKILL.md` without a valid frontmatter name or description; or a path that escapes the source.
- Frontmatter follows the Agent Skills contract (`name`, `description`, optional `license`, `compatibility`, `metadata`, `disable-model-invocation`); unknown fields are preserved but not interpreted.
- Duplicate display names remain allowed, since grants reference skill ids.
- Imported cards show a source badge; hand-written cards show none (`manage.md`).
- API: `GET /api/skills/search?q=` looks up skills.sh candidates, `POST /api/skills/preview` resolves a source to a preview, and `POST /api/skills/import` stores the confirmed selection. Search and preview never write.
