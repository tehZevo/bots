# Tags

- A tag is a global label used only to organize bots; tags carry no behavior and are never exposed to a bot.
- Tags are managed in a top-level `Tags` tab following the sidebar, drawer, title and icon rules of `../ui/navigation.md`: one card per tag (name plus the number of bots carrying it), an Add/Edit modal with a name field, and delete behind the confirm dialog (`../ui/confirm.md`).
- A bot carries any number of tags, picked in the bot detail `General` tab through a multiselect with autocomplete (`../bots/detail.md`). The dropdown lists not-yet-attached tags whose names contain what is typed.
- When the typed name matches no existing tag (case-insensitively), that dropdown instead offers one `+ Create "<name>"` action; clicking it creates the tag and attaches it to the bot immediately — no modal, no separate Tags-tab visit — then clears the field. A failed create keeps the typed text so it can be corrected.
- Enter performs the same commit as choosing: an exact existing name is attached (even one already attached or outside the shown suggestions) instead of creating a duplicate; anything else creates. Names stay unique across the registry (`/api/tags` rejects duplicates with 400).
- The bots dashboard filters by tag with a dropdown multiselect of tag names beside the existing search, status and role filters; bots carrying at least one of the chosen tags are kept, and the filters combine (`../bots/dashboard.md`).
- Tags are invisible to the agent: they never enter the system prompt, the conversation context or any tool output, and no tool or API lets a bot read or set them.
- Tag CRUD and assignment are available via `/api/tags`; records persist across restarts.
