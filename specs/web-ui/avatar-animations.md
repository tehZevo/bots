# Avatar animations

- Idle: the avatar floats around slowly — a gentle drift in small circles at a modest radius near its resting spot, each movement an ever-so-slight swish with a whisper of rotation (a few pixels and two or three degrees, never a spin), steady dim glow, only occasional blinks.
- Active + loop running: the same swish-and-tilt float at a noticeably wider radius (it "paces"), with a slightly stronger — still subtle — rotation lean into each move, and a gently pulsing glow; eyes look around on a loose irregular cycle while working.
- Blinking belongs to every animated state as an infrequent quick eyes-closed beat — never during Blocked or Disabled.
- Issues = occasional quick worried flicker (brief opacity dip) layered over the current motion; Blocked = still and desaturated, glow off; Disabled = fully still and gray like the dot.
- Animation is pure CSS/transform over the generated SVG — no per-avatar assets or JS timers; presets share one wrapper so all twelve shapes animate identically.
- `prefers-reduced-motion` users get static rendering at full color with the glow kept.
- The card dot stays the precise status signal; avatar motion is ambient and must never contradict the health level.
