# Bot avatars

- Every bot shows a generated avatar on its card and in the detail modal header; nothing is stored or uploaded.
- An avatar is one of ten fixed preset shapes with two simple oval eyes — no initials, text, or mouths. All presets are smooth closed outlines drawn as one SVG path (dense uniform sampling of `r(θ)` joined by cubic Béziers); nothing is hand-placed and nothing is spiky.
- The presets, each a fixed radial profile `r(θ) = R · (1 + Σ wᵢ·sin(nᵢθ + φᵢ))` with locked coefficients: `pebble` (near-circle, tiny n=3+n=4 ripple), `egg` (vertical n=2 bulge), `pear` (n=1+n=2 stacked asymmetry, heavy bottom), `bean` (crescent indent via n=2 at 45° plus mild n=1), `cushion` (rounded square, small cos(4θ)), `trilobe` (soft rounded triangle, cos(3θ)), `hexpebble` (gentle hexagon, small cos(6θ)), `clover` (five soft lobes, capped cos(5θ)), `dimple` (one flattened side via negative lobe at a seeded angle), `drop` (teardrop leaning to a seeded direction).
- A PRNG seeded from the bot id picks only: preset index, fill color from a fixed bright palette readable in both themes, and eye size/spacing/gaze with dark theme-aware oval eyes slightly above center. The same bot always renders identically; renaming changes nothing.
- On a card, the avatar sits at the left with the bot's name to its right, top-aligned.
- Motion (blink/wobble per health level) is deferred to its own spec once avatars ship; the static avatar must stand on its own.
