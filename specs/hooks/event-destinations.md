# Event destinations

- A destination is a server-wide webhook: name + URL + secret + chosen event types; managed in Settings → System (`../settings/preferences.md`) following the resource-tab pattern (`../ui/resource-tabs.md`); secrets render masked after save.
- Deliveries POST `{ id, type, occurred_at, data }` as JSON with `X-Bots-Signature: sha256=<hmac of body>` keyed by the destination secret; timeouts at 10 s; slow or failing endpoints never block a run, trigger fire, or notification.
- Event types: `run.finished` (bot id/name, status, source, token totals — no message text), `bot.blocked`, `bot.recovered`, `notification.created` (title + kind only), and `breaker.tripped`; payloads carry no secret values by construction (`../secrets/redaction.md`).
- Failed deliveries retry up to 3 times with exponential backoff per `../llm/retry-backoff.md`, then record as failed; each attempt logs time, event type, HTTP status and duration under run-history retention — the same delivery-log shape as inbound webhooks (`../triggers/webhook-deliveries.md`).
- While globally paused no new events fire except `breaker.tripped`; disabled destinations deliver nothing and keep their logs.
- Every destination offers Send test (a `ping` event) showing status and latency inline; creating or editing takes effect immediately without restart.
- API: CRUD `/api/hooks` + `GET /api/hooks/:id/deliveries`, any signed-in user (`../auth/multi-user.md`).
