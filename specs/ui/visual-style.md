# Visual style

- All color and geometry comes from named tokens defined for both themes — surfaces, text, muted, border, accent (brand), danger, ok, warn, info — referenced as `var(--…)`; no hardcoded hex outside the token definitions. The accent marks selection, focus and primary actions; danger marks destructive affordances only.
- Exactly two radii exist: one for controls (buttons, inputs, selects, chips) and one for cards/dialogs; menus use the card radius. Focus shows a visible ring in the accent color on keyboard focus (`:focus-visible`) for every interactive element.
- The UI is flat: solid theme surfaces only — no gradients, glows or glass effects on chrome; any border uses the theme border token.
- Cards are the universal container for repeated items and groups (bot cards, runs, triggers, providers, MCP servers, settings blocks) with one shared radius, padding and background across all tabs.
- Cards carry a soft drop shadow for elevation in light mode; dark mode expresses the same hierarchy through surface contrast instead of glow. Hovering a card may deepen the shadow only — no scale or translate on layout containers.
- Spacing follows a rhythm of two tokens: an inner gap between siblings inside a card and a larger gap between cards/sections, both defined as CSS custom properties; ad-hoc margins are not used.
- Buttons, inputs, selects and tabs share one height/padding scale; controls grouped in a row keep at least the inner gap between them.
- Three button variants exist: solid accent primary, ghost (transparent, border token) secondary, and danger for destructive actions; an action row contains at most one primary. Selects and checkboxes are themed to match inputs — no raw native controls inside cards or dialogs.
- Modals and drawers render over a dimmed full-screen backdrop; elevation is a small fixed scale (menu < panel < modal) expressed through shadow in light mode and surface step + border in dark.
- All icons come from one inline SVG line-icon set at consistent sizes; emoji never substitute for an icon (e.g. the notifications bell).
- Settings-style forms constrain their fields to a readable column (~560px max width) instead of stretching across the pane; labels sit above controls per `forms.md`.
