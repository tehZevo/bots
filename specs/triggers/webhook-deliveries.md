# Webhook delivery log

- Every `POST /api/webhooks/:triggerId` attempt records a delivery row regardless of outcome: timestamp, trigger id, HTTP status, outcome (`accepted`, `unauthorized`, `not_found`, `disabled`, `too_large`, `bad_request`), and duration in ms.
- A delivery stores the first 2 KB of the request body as preview; bearer secrets never appear in previews or logs.
- The trigger editor's webhook pane shows recent deliveries for the selected trigger — newest first, last 100 — each with time, status badge and duration (`../triggers/editor.md`).
- API: `GET /api/triggers/:id/deliveries` returns the same page for key-authenticated callers (`../api/rest-keys.md`).
- Deliveries are kept per trigger under the same retention as run history (`../runs/lifecycle.md`); deleting a trigger deletes its deliveries, rotating its secret keeps them (`webhooks.md`).
- Logging never blocks injection: delivery recording is best-effort and a webhook's response and injection behavior stay exactly as specced in `webhooks.md`.
- Rejected attempts (401/404/409) change nothing except their delivery row.
