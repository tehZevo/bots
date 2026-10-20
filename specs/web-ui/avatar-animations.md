# Avatar animations

- Idle: the avatar floats around slowly — drifting up and down and side to side together at a modest radius near its resting spot, each movement paired with a slight rotation (tilting) left and right by a few degrees (never a spin), steady dim glow, only occasional blinks.
- Idle eye tracking: when the user's cursor comes within roughly a card's width of an idle avatar, its eyes turn to follow it — shifting a few pixels toward the pointer inside their sockets; when the pointer leaves that radius they ease back to the seeded resting gaze. Pointer-less devices (touch) never track.
- Active + loop running: it drifts around considerably more than idle — roaming a wide area near the card corner at a faster pace (larger travel radius, longer wander path), floating up and down and side to side together with a slightly stronger — still subtle — rotation (tilt) left and right by a few degrees into each move, and a gently pulsing glow; eyes look around on a loose irregular cycle while working.
- Blinking belongs to every animated state as an infrequent quick eyes-closed beat at a seeded 3–8 s cadence, never in lockstep across bots — and never during Blocked or Disabled.
- Issues = occasional quick worried flicker (brief opacity dip) layered over the current motion; Blocked = still and desaturated, glow off; Disabled = fully still and gray like the dot.
- Animation is pure CSS/transform over the generated SVG — no per-avatar assets or JS timers; presets share one wrapper so all twelve shapes animate identically. Cursor tracking is the sole scripted exception: one shared document-level `pointermove` listener drives every idle avatar in range — still no per-avatar listeners or timers.
- `prefers-reduced-motion` users get static rendering at full color with the glow kept; eyes never track.
- The card dot stays the precise status signal; avatar motion is ambient and must never contradict the health level.
