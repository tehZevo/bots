# Scheduling

Status: implemented

Bots wake themselves on a schedule; the scheduler is a single in-process tick loop.

- A schedule is either a standard cron expression (`0 9 * * 1-5`) or an interval shorthand `@every <n><s|m|h|d>` (e.g. `@every 30m`).
- On create, the system computes and stores `next_run_at` from the schedule.
- Every 15 s the scheduler selects enabled bots whose `next_run_at <= now`, advances their `next_run_at` to the following occurrence, and starts a run with trigger `schedule`.
- A bot already running is skipped for that tick (no queueing, no overlap).
- Disabled bots never fire on schedule but can still be run manually.
- Missed occurrences while the server was down are not replayed; the next tick reschedules from now.

## Scenarios

- Given an enabled bot due at T, When the clock passes T and the bot is idle, Then a `schedule` run starts and `next_run_at` moves to the next occurrence.
- Given a bot mid-run when it becomes due, Then no second run starts for that tick.
- Given schedule "bogus", When creating a bot, Then 400 invalid schedule.
