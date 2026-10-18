# Bot avatars

- Every bot shows a generated avatar on its card and in the detail modal header; nothing is stored, uploaded, or configured.
- An avatar is a flat colored blob with two simple oval eyes — no initials, text, or mouths.
- The blob outline comes from a radial function `r(θ) = R · (1 + Σ wᵢ·sin(nᵢθ + φᵢ))` over 3–4 low harmonics (`n` in 2..5), amplitudes capped near 0.18R so shapes stay smooth and simple; the sum is inherently smooth, so no outline point is ever authored by hand.
- The curve renders as one closed SVG path: sample `r(θ)` at ≥64 evenly spaced angles and connect them with a periodic Catmull-Rom spline converted to cubic Béziers; scale so the blob fits its slot without clipping.
- A PRNG seeded from the bot id picks everything — harmonics, phases, fill color, eye size/spacing/gaze direction — so the same bot always renders the identical avatar on every client, and renaming a bot changes nothing about it.
- Fills come from a fixed bright palette readable against both card backgrounds; eyes are dark theme-aware ellipses slightly above center, with seeded variants (wide-set, near-set, half-lidded).
- On a card, the avatar sits at the left with the bot's name to its right, top-aligned.
- Motion (blink/wobble per health level) is specified separately in `avatar-animation.md`; the static avatar must stand on its own.
