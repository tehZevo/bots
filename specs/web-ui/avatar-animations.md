# Avatar animations

- Idle: the avatar floats around slowly — a gentle drift in small circles at a modest radius near its resting spot, each movement an ever-so-slight swish with a whisper of rotation (a few pixels and two or three degrees, never a spin), steady dim glow, only occasional blinks.
- Idle eye tracking: when the user's cursor comes within roughly a card's width of an idle avatar, its eyes turn to follow it — shifting a few pixels toward the pointer inside their sockets; when the pointer leaves that radius they ease back to the seeded resting gaze. Pointer-less devices (touch) never track.
- Active + loop running: it drifts around considerably more than idle — roaming a wide area near the card corner at a faster pace (larger travel radius, longer wander path), with a slightly stronger — still subtle — rotation lean into each move and a gently pulsing glow; eyes look around on a loose irregular cycle while working.
- Blinking belongs to every animated state as an infrequent quick eyes-closed beat — never during Blocked or Disabled.
- Issues = occasional quick worried flicker (brief opacity dip) layered over the current motion; Blocked = still and desaturated, glow off; Disabled = fully still and gray like the dot.
- Animation is pure CSS/transform over the generated SVG — no per-avatar assets or JS timers; presets share one wrapper so all twelve shapes animate identically. Cursor tracking is the sole scripted exception: one shared document-level `pointermove` listener drives every idle avatar in range — still no per-avatar listeners or timers.
- `prefers-reduced-motion` users get static rendering at full color with the glow kept; eyes never track.
- The card dot stays the precise status signal; avatar motion is ambient and must never contradict the health level.
