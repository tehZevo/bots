# Spend circuit breaker

- A server-wide trailing-30-day token cap; unlimited by default. It is one number over every provider and every bot, edited in `Settings` beside server preferences (`../settings/preferences.md`).
- The check runs when a run reaches its terminal status: total tokens (input + output + cache read + cache write, per `tokens.md`) pushed the trailing-30-day server total past the cap → the breaker trips.
- Tripping arms the global pause (`../bots/global-pause.md`) and raises one in-app notification stating usage vs cap (`../notifications/in-app.md`); it interrupts nothing already running and blocks no other action.
- Resume is refused while trailing usage exceeds the cap: the status bar explains why, showing current usage and the cap. Raising or clearing the cap, or the 30-day window rolling off, permits resume; resuming re-arms the breaker normally (`global-pause.md`).
- The setting and tripped state persist across restarts; `GET /api/breaker` returns `{ limit_tokens, tokens_30d, exceeded }`, `PUT /api/breaker` sets the cap (0 = unlimited); any signed-in user may read or change it.
- Distinct from per-bot budgets (`tokens.md`), which block a single bot's runs; the breaker halts the whole server and is evaluated once per run end — no extra model calls, timers or background jobs.
