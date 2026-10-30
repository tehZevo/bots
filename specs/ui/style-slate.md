# Style — Slate

Crisp technical system: cool blue-gray canvas, hairline-bordered cards with tight shadows, compact density, monospace data. Light mode ships first; dark derives from the same tokens per `theme.md`.

- Tokens (light): canvas `#eef1f5`, surface white, text slate near-black `#17212e`, muted steel gray, visible 1px border `#d7dee8` on every card and input, accent blue `#2563eb`; status hues deepened for legibility on light. No raw hex outside tokens (`visual-style.md`).
- Cards: white with a hairline border plus a single tight shadow (0 1px 2px at 8%) — elevation stays subtle and precise; hover raises to a 2–8px shadow and slightly darkens the border. One radius scale: 6px controls, 10px cards/dialogs.
- Density is compact: smaller paddings (card ~12x14, control height 32), body text 0.875rem; schedules, counts and status lines render in monospace with tabular figures so data aligns like a terminal panel.
- Sidebar keeps a visible divider; nav rows are low pills with muted labels — the active row gets a light blue tint plus a 2px inset accent bar on its left edge (selection = marker + tint, not fill).
- Buttons: solid blue primary, white bordered secondary, danger as white with red text and pale-red border; status-bar actions sit in the white bar as compact bordered buttons.
- Inputs/selects are white with slate borders at 6px radius; focus is a crisp 2px accent outline offset 1px.
- Chat sidebar stays a work panel: flat white surface, hairline separators between messages, timestamps and tool names monospace; dialogs rise over a plain dark scrim (no blur).
