# Avatar animations

- Avatars (`web-ui/avatars.md`) animate to the bot's health level (`web-ui/status-colors.md`): Active + loop running = subtle live motion (breathing pulse or slow bob), Active idle = sleeping state (dimmed, eyes-closed variant of the initials tile), Issues = occasional worried flicker on the ring, Blocked = still and desaturated.
- Animation is pure CSS derived from existing data — no per-avatar assets; reduced-motion users get static rendering at full color.
- The card dot keeps its role as the precise status signal; avatar motion is ambient and must never contradict the health level.
