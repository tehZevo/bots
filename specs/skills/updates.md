# Skill updates

- Only imported skills have an update state; hand-written skills never show one (`import.md`).
- A check re-fetches an imported skill from its recorded source and ref, compares the bundle content hash with the stored one, and records up to date, update available or source unavailable plus a timestamp. Checking changes no skill content.
- An update replaces the stored bundle, instructions, name and description with that upstream version, keeps the skill id and every role grant, and refreshes content hash, resolved commit and updated timestamp; running bots pick it up on their next run like any edit (`manage.md`).
- A skill whose stored instructions or files no longer match its installed hash is marked modified. Checking still reports upstream state, and applying an update discards the local edits only behind a confirm dialog naming the skill (`../ui/confirm.md`).
- Skills imported from a branch track that branch's head; skills imported from a tag or commit are pinned — never compared against another ref and offering no update until re-imported elsewhere.
- The server checks every imported skill in the background at most once per day, recording results only: it never applies an update without user action, and check failures never affect runs.
- A source that vanished or became unreachable yields source unavailable; the stored bundle keeps working and is never deleted automatically.
- The Skills tab header offers Check all; imported cards show their source badge, last result with timestamp, per-skill Check and Update actions, an update-available marker while one waits, and a modified marker until the skill is updated or detached.
- Detaching clears provenance, pinning and update state while keeping current content, making the skill hand-written and no longer checked; deleting stays as `manage.md`.
- API: `POST /api/skills/{id}/check`, `POST /api/skills/{id}/update`, `POST /api/skills/check` for all imported skills, and `POST /api/skills/{id}/detach`; each response reports the per-skill result.
