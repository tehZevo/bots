# Bot avatars

- Every bot shows an avatar on its card and in the detail modal header.
- Three ways to set one, all from `General`: upload an image (≤ 1 MB, centered square crop), initials over a solid color, or generated — a deterministic glyph + color derived from the bot id.
- Generated is the default; nothing is stored until the user picks something else.
- Avatar images are stored under the data dir and served at `GET /api/bots/:id/avatar`; uploads replace the previous file immediately everywhere.
