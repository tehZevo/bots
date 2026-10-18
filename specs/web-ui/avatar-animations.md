# Avatar animations

- Avatars (`web-ui/avatars.md`) animate to the bot's health level (`web-ui/status-colors.md`): Active + loop running = subtle live motion (slow bob or breathing scale) with a gently pulsing glow; Idle = resting state — eyes slowly blink shut and open on a long cycle, glow steady and dim; Issues = occasional quick worried flicker (brief opacity dip); Blocked = still and desaturated, glow off; Disabled = fully still and gray like the dot.
- Animation is pure CSS/transform over the generated SVG — no per-avatar assets or JS timers; presets share one wrapper so all twelve shapes animate identically.
- `prefers-reduced-motion` users get static rendering at full color with the glow kept.
- The card dot stays the precise status signal; avatar motion is ambient and must never contradict the health level.
