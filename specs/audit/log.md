# Global audit log

- The server appends one immutable row per consequential action to a global audit log: bot create/edit/archive/delete, trigger changes and firings, run start/finish/error/interrupt, chat sends, every tool call, pause/resume/stop-all, watchdog and breaker events, logins/logouts, API-key create/revoke, config backup export/restore.
- Each entry carries timestamp, actor (user email, bot id + name, trigger id, or `system`), action verb, target kind + id + recorded name, and a one-line summary of at most 200 characters.
- Entries are append-only: no edit or delete API exists; the only removal is retention (below).
- Tool calls log one entry each — tool name plus a truncated input/output line; full transcripts stay in run drill-down (`../runs/drill-down.md`).
- Redaction identical to run transcripts applies before storage: assigned secret values, provider keys and MCP env values appear only as `[REDACTED:<NAME>]` placeholders (`../secrets/redaction.md`).
- Deleting a bot or trigger removes its own records but never audit rows; the log keeps showing them under their recorded names.
- A top-level **Activity** sidebar tab lists entries newest-first with filters on actor kind, action type, target text and time range (`../ui/navigation.md`, `../ui/resource-tabs.md`).
- API: `GET /api/audit?actor=&type=&q=&since=&until=&limit=`, read-only for any authenticated principal.
- Retention defaults to forever; one server-wide Settings number keeps entries for N days (0 = forever), purged daily with the purge itself recorded as an audit entry by actor `system`.
- Failed login attempts are not logged; successful sign-ins are.
