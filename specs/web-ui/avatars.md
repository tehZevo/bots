# Bot avatars

- Every bot shows a generated avatar on its card and in the detail modal header; nothing is stored or uploaded.
- An avatar is a flat colored smooth shape with two simple oval eyes — no initials, text, or mouths.
- Shapes come from a small seeded menu of families: blob, egg, rounded triangle/hexagon, bean. All are just circles whose radius wobbles smoothly (`r(θ)` = base + a few low-frequency waves); the curve is sampled densely and drawn as one smooth closed SVG path — no hand-placed points, never spiky or lumpy.
- A random generator seeded from the bot id picks the family, wobble, fill color, and eye size/spacing; the same bot always gets the same avatar, and renaming changes nothing.
- Fills come from a fixed bright palette readable in both themes; eyes are dark theme-aware ovals slightly above center.
- On a card, the avatar sits at the left with the bot's name to its right, top-aligned.
- Motion (blink/wobble per health level) is deferred to its own spec once avatars ship; the static avatar must stand on its own.
