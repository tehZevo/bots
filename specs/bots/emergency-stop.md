# Emergency stop-all

- The status bar carries a `Stop all` control (the panic button) beside the global Pause/Resume toggle; it interrupts every running bot at once and arms the global pause in one action (`global-pause.md`, `dashboard.md`).
- Each affected loop is interrupted exactly as per-bot interrupt works: inference aborted, terminal run status `error` with error `interrupted`, context kept (`interrupt.md`).
- Arming the pause is what makes it an emergency brake: queued and injected work holds instead of instantly restarting loops; nothing auto-resumes.
- The action requires the confirm dialog before executing (`../ui/confirm.md`) and is idempotent — pressing it with nothing running still arms the pause.
- Any signed-in user may trigger it; `POST /api/stop-all` interrupts all active loops, sets `paused: true`, and returns `{ "stopped": <count> }`.
- There is no separate stop-all state: after the action the server holds exactly the standard paused state plus the resulting interrupted runs (`../runs/lifecycle.md`).
