# Style — Bloom

Bold expressive system: near-white tinted canvas, generously rounded cards with deep violet-tinted shadows, chunky pill controls, confident type. Light mode ships first; dark derives from the same tokens per `theme.md`.

- Tokens (light): canvas `#faf9fc` with a faint violet cast, surface white, text deep plum-black `#1e1830`, muted mauve gray, soft border `#e7e2f2`, accent violet `#7c3aed`; danger rose, ok emerald — status colors stay saturated for chip use. No raw hex outside tokens (`visual-style.md`).
- Cards: borderless white with a two-layer shadow (small contact + 40px ambient at ~22%); hover swaps the ambient layer to a violet-tinted glow-shadow (still solid surfaces, no gradients on chrome). Card radius 18–24; inputs 14 with 2px borders.
- Buttons are full pills with generous height (~40px) and weighty semibold labels: violet primary casts a colored drop shadow; secondary is white with a 2px border; danger is white with rose text on a pale-pink border. Selection in the sidebar is a solid violet pill with white label and glow-shadow — the boldest selection treatment of the proposals.
- Typography leads: page titles ~1.6rem at weight 750 with tight tracking; nav labels medium; captions muted non-italic. Headings, not borders, organize sections.
- Focus rings are thick (3px) 35%-alpha violet with offset — playful but unmissable.
- Chat and dialogs feel inflated: 24px dialog radius floating over a blurred, slightly saturated scrim; the chat sidebar carries a wide violet-tinted side shadow.
- Health dots keep semantic colors at full saturation; cards may reuse each bot's avatar hue for hover glow only.
