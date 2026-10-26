# Effective prompt inspector

- The bot settings modal carries a `Prompt` tab (`../bots/detail.md`) showing the exact effective system prompt that will be sent at the next loop start for this bot (`registry.md` assembly order).
- The assembled text renders in one monospace block with each source section visually marked and labeled — default, name line, instructions, assignment scope, role, skills advertisement, Projects, team section.
- Viewing rebuilds on open and after saving the `General` tab; it never calls the model and changes nothing about the bot or its runs.
- An estimated size line shows tokens for the whole prompt using the compaction estimator, labeled as an estimate (`../context/usage-breakdown.md`).
- Below the text: attached Project names with body sizes, granted skills as name + id only (never file contents), and a count of MCP-provided tools; tool schemas are counted but not rendered.
- Secret values never appear in the view or its API response — prompts exclude secrets by construction (`../secrets/manage.md`).
- API: `GET /api/bots/:id/prompt` returns `{ text, sections: [{ label, start, length }] }`; any signed-in user may read it (`../auth/multi-user.md`).
- The tab scrolls inside the constant-size modal and stays legible at 390px width.
