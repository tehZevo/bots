# Visual style

- The UI is flat: solid theme surfaces only — no gradients, glows or glass effects on chrome; any border uses the theme border token.
- Cards are the universal container for repeated items and groups (bot cards, runs, triggers, providers, MCP servers, settings blocks) with one shared radius, padding and background across all tabs.
- Cards carry a soft drop shadow for elevation in light mode; dark mode expresses the same hierarchy through surface contrast instead of glow. Hovering a card may deepen the shadow only — no scale or translate on layout containers.
- Spacing follows a rhythm of two tokens: an inner gap between siblings inside a card and a larger gap between cards/sections, both defined as CSS custom properties; ad-hoc margins are not used.
- Buttons, inputs, selects and tabs share one height/padding scale; controls grouped in a row keep at least the inner gap between them.
