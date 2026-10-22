# Avatar animations

- Idle (sleeping): the avatar sleeps — eyes closed as flat horizontal lines, the body squashing slightly vertically on a slow breathing beat while it floats gently up and down near its resting spot; steady dim glow, no side-to-side drift, no blinking and no eye tracking.
- Active + loop running: it drifts around considerably more than a sleeping avatar — roaming a wide area near the card corner at a faster pace (larger travel radius, longer wander path), floating up and down and side to side together with a slightly stronger — still subtle — rotation (tilt) left and right by a few degrees into each move, and a gently pulsing glow; eyes open and looking around on a loose irregular cycle while working.
- Blinking belongs to every awake animated state as a quick eyes-closed beat at a seeded 3–8 s cadence, never in lockstep across bots — and never while sleeping, Blocked or Disabled.
- Issues = occasional quick worried flicker (brief opacity dip) layered over the awake floating motion.
- Blocked = eyes open, still and desaturated, glow off.
- Disabled = the sleeping pose held still and gray like the dot — eyes closed, body squished, no float, no glow.
- Animation is pure CSS/transform over the generated SVG — no per-avatar assets or JS timers; presets share one wrapper so all twelve shapes animate identically.
- `prefers-reduced-motion` users get static rendering at full color with the glow kept; the sleeping pose holds still.
- The card dot stays the precise status signal; avatar motion is ambient and must never contradict the health level.
