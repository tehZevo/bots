# Webhook trigger

- `webhook` is a trigger kind: firing comes from an inbound HTTP call instead of the clock.
- Creating a webhook trigger returns a dedicated URL `/api/webhooks/:triggerId` and a generated shared secret; the secret is shown once at creation and once on rotation, never again.
- Inbound `POST` must present the secret as `Authorization: Bearer <secret>`; missing or wrong secrets return 401, unknown triggers 404, disabled bots/triggers 409 — rejected calls change nothing.
- The request body (max 64 KB) is appended to the trigger message as event payload and injected like any other fire (`model.md`).
- Webhook triggers are created, edited and deleted through the normal `/api/bots/:id/triggers` CRUD and appear on the Triggers tab with their URL.
- Every call to a webhook URL is logged, accepted or rejected: time, HTTP status, outcome (`accepted`, `unauthorized`, `not_found`, `disabled`, `too_large`, `bad_request`), duration, and the first 2 KB of the body as a preview.
- The trigger editor's webhook pane lists the last 100 deliveries newest-first, each expandable to its preview; `GET /api/triggers/:id/deliveries` returns the same page to API-key callers.
- Previews never contain the bearer secret; rotating a secret keeps its history; deleting the trigger deletes its log.
