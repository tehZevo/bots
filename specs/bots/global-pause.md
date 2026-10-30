# Global pause

- The status bar carries a global Pause/Resume toggle that holds every bot at once; it is a server-wide switch, not a per-bot flag, and any signed-in user may flip it (`dashboard.md`).
- While paused, nothing new starts: triggers do not fire — passed occurrences are skipped, never catch-up-fired (`../triggers/enable-disable.md`) — chat sends do not start a run, and `POST /api/bots/:id/run` is rejected.
- A bot already running when the pause lands finishes its current turn and then goes quiet; the run ends `ok`, and its messages stay in context.
- Pausing is not disabling: each bot keeps its enabled flag, instructions and triggers, and its own health color is unchanged (`status-colors.md`). The status bar shows the global paused state instead.
- Messages injected while paused are held, not dropped, and drain when the bots resume; a resumed bot picks up its pending work and starts a new run.
- The paused state is persisted on the server and survives restarts; `GET /api/pause` returns `{ "paused": boolean }` and `POST /api/pause` sets it. A pause armed by the spend circuit breaker refuses Resume until usage drops under the cap or the cap changes (`../usage/circuit-breaker.md`).
