# Bot avatars

- Every bot shows a generated avatar on its card and in the detail modal header; nothing is stored, uploaded, or configured.
- An avatar is a flat colored smooth shape with two simple oval eyes — no initials, text, or mouths.
- All shapes share one pipeline: pick a positive radial profile `r(θ)` from a seeded family, sample it at ≥64 uniform angles, close it into a single SVG path smoothed to C¹ (periodic Catmull-Rom converted to cubic Béziers, or Chaikin corner-cutting — uniform sampling keeps both cusp-free), and scale it to fill its slot. No outline point is ever authored by hand.
- Seeded shape families, all smooth by construction: blob (`r = R·(1 + Σ wᵢ·sin(nᵢθ+φᵢ))`, 3–4 harmonics with n in 2..5, amplitudes ≤0.18R), egg/potato (dominant single n=2 harmonic), soft k-gon (small-amplitude `cos(kθ)`, k in 3..6 — a rounded triangle/hexagon feel), and bean (one low harmonic plus mild vertical asymmetry).
- A PRNG seeded from the bot id picks everything — family, harmonics/phases, fill color, eye size/spacing/gaze direction — so the same bot always renders the identical avatar on every client, and renaming a bot changes nothing about it.
- Fills come from a fixed bright palette readable against both card backgrounds; eyes are dark theme-aware ellipses slightly above center, with seeded variants (wide-set, near-set, half-lidded).
- On a card, the avatar sits at the left with the bot's name to its right, top-aligned.
- Motion is specified separately (`avatar-animation.md`, #109); uniform-angle sampling gives point-to-point correspondence so families can morph into each other and eyes can blink without redraw jumps.
