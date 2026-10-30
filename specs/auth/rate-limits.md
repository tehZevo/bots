# Endpoint rate limits

- Unauthenticated endpoints are rate-limited per client IP with fixed in-process windows; exceeding a limit answers `429 {"error":"rate_limited"}` like device login already does (`device-login.md`).
- Login and signup: at most 10 failed credential attempts per 15 minutes per IP (successes reset the counter); any unauthenticated auth-route request beyond 300/min per IP is refused outright, protecting the scrypt KDF from CPU DoS.
- Webhook trigger deliveries (`POST /api/webhooks/:triggerId`, `../triggers/webhooks.md`) are capped at 60 req/min overall and 30 req/min per trigger id; oversized payloads still fail with 413 first.
- Client IP is the socket address by default: `X-Forwarded-For` is ignored unless the operator opts in with `TRUST_PROXY=true`, which takes the first XFF hop instead. All limiters (including device login's) share this one resolution rule.
- Windows live in process memory only — a restart clears them; no persistence, no admin UI for budgets.
