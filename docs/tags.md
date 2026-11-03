# Tags

Tags are plain labels for organizing bots — they carry no behavior and are never visible to the agents themselves (no system prompt, context, or tool ever sees them).

Manage them under **Tags**: one card per tag showing how many bots carry it. Add and rename through the modal; deletion sits behind a confirm dialog and just removes the label from every bot.

Attach tags to a bot in its detail **General** tab with the same dropdown multiselect used across the app: the button reads `Tags: All` until you pick something, then lists the attached tags by name. Open it and every tag is a checkbox — tick to attach, untick to detach, immediately. A text field on top narrows the list as you type; when what you type matches no existing tag, the list offers **+ Create "&lt;name&gt;"** instead, which creates the tag and attaches it in one step (a failed create keeps your text so you can fix it). Pressing `Enter` in the filter commits what you typed: a name matching exactly one tag attaches it rather than creating a duplicate, anything else creates.

The Bots dashboard can filter by tag alongside status and role; the filter's exact behavior lives in [Bots](/bots#cards-and-filters).

Everything is available headlessly via `/api/tags` (list includes per-tag bot counts; assignment goes through `PATCH /api/bots/:id` with `tag_ids`).
