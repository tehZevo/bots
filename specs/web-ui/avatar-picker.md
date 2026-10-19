# Avatar picker

- Clicking a bot's avatar in the detail modal header opens an avatar picker popover anchored to it; clicking outside or pressing Escape closes it.
- The picker shows the twelve preset shapes from `web-ui/avatars.md` as a grid of live previews and the fixed bright palette as color swatches, each marked when currently active.
- Choosing a shape and/or color overrides generation for that bot immediately — cards, modal header and every other render site update at once; the choice persists with the bot across reloads and renames.
- Eyes, gaze and motion stay derived from the bot id regardless of the picked shape/color.
- A `Reset to auto` control clears the override and restores the seeded avatar.
- Bots without an explicit pick keep rendering fully generated avatars (`web-ui/avatars.md`).
