# Tags

Tags are plain labels for organizing bots — they carry no behavior and are never visible to the agents themselves (no system prompt, context, or tool ever sees them).

Manage them under **Tags**: one card per tag showing how many bots carry it. Add and rename through the modal; deletion sits behind a confirm dialog and just removes the label from every bot.

Attach tags to a bot in its detail **General** tab: a chip list with an autocomplete input. The dropdown lists not-yet-attached tags whose names contain what you type; when nothing matches, it offers **+ Create "&lt;name&gt;"** instead — clicking creates the tag and attaches it immediately, then clears the field (a failed create keeps your text). Enter commits like choosing: an exact existing name is attached rather than duplicated, anything else creates.

The Bots dashboard gains a `Tag:` dropdown multiselect beside the status and role filters; bots carrying at least one of the chosen tags are kept, and all filters combine.

Everything is available headlessly via `/api/tags` (list includes per-tag bot counts; assignment goes through `PATCH /api/bots/:id` with `tag_ids`).
