# Web UI

Status: implemented

A minimal single-page console for operating bots. No auth yet (planned).

- Bot list sidebar with create form (name, task, cron schedule, optional system prompt).
- Bot detail view: actions **Run now**, **Enable/Disable**, **Clear memory**, **Delete**; shows schedule and run history (newest first, status + output/error per run) or the stored message transcript.
- UI polls the API; there is no live streaming of in-progress runs yet (planned).
- In production the server also serves the built UI from its own origin; in dev Vite proxies `/api` to the server.

## Scenarios

- Given a new bot created via the form, Then it appears in the sidebar and the scheduler assigns it a next run.
- Given "Run now" while already running, Then an error alert shows (409).
