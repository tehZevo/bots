# Bot avatars

Every bot shows an avatar on its card — left, with the bot's name to its right, top-aligned — and in the detail modal header, generated from its id unless the user picked a shape/color explicitly.

- An avatar is one of twelve fixed presets with two tall oval eyes — no initials, text or mouths: `pebble`, `egg`, `pear`, `bean`, `cushion` (rounded square), `trilobe` (soft triangle), `hexpebble`, `clover` (five soft lobes), `star5`, `star6` (puffy stars rounded by the smoothing pass), `dimple` (one flattened side at a seeded angle) and `drop` (teardrop leaning to a seeded direction). Each is one smooth closed SVG path from a locked radial profile — nothing hand-placed, nothing spiky.
- For bots without a stored pick a PRNG seeded from the bot id chooses preset index, fill color from a fixed bright palette readable in both themes, and eye size/spacing/gaze with dark theme-aware tall oval eyes slightly above center; the same bot always renders identically and renaming changes nothing.
- Clicking the avatar in the detail header opens a picker popover anchored to it: the twelve presets as static previews plus the fixed palette as color swatches, each marked when active. Choosing overrides generation immediately on every render site and persists with the bot across reloads and renames; eyes, gaze and motion stay seeded from the bot id whatever is picked. `Reset to auto` restores the generated avatar; outside clicks or Escape close the picker.

# Motion

- Sleeping (Idle): eyes closed as flat horizontal lines, slight vertical squash on a slow breathing beat, gentle up-and-down float near rest with a steady dim glow — no side-to-side drift, blinking or eye tracking. Disabled holds the same pose still and gray like the dot: no float, no glow.
- Active with the loop running: it roams a wide area near the card corner at a faster pace than sleeping — larger travel radius, longer wander path — floating up/down together with side-to-side motion and a slightly stronger (still subtle) few-degree tilt into each move, glow gently pulsing; eyes open and looking around on a loose irregular cycle.
- Blinking belongs to every awake animated state as a quick eyes-closed beat at a seeded 3–8 s cadence, never in lockstep across bots — and never while Sleeping, Blocked or Disabled. Issues layers an occasional worried flicker (brief opacity dip) over the awake motion; Blocked is still and desaturated with eyes open and glow off.
- Animation is pure CSS/transform over the generated SVG — no per-avatar assets or JS timers; presets share one wrapper so all twelve animate identically, and picker previews stay still. `prefers-reduced-motion` renders statically at full color keeping the glow, holding the sleeping pose still.
- The card dot stays the precise status signal; avatar motion is ambient and must never contradict the health level (`status-colors.md`).
