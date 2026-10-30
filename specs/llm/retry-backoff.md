# Provider retry and backoff

- A model request failing with HTTP 429, 5xx, or a connection error is retried automatically: up to 3 retries per request with exponential delay (about 1 s doubling), capped at 60 s.
- The stored exponential schedule determines each wait; provider `Retry-After` headers do not override it. Waits survive restarts and resume at their deadline (`../runs/crash-recovery.md`).
- 4xx responses other than 429 are never retried — they surface immediately as the run's error text.
- While backing off the loop waits with no new turn: the bot stays `running` and may report the wait via its status line (`../bots/task-and-status.md`).
- Retries stay inside the current turn — a retry is not a steer, never starts a second run, and an interrupted bot stops waiting immediately (`../bots/interrupt.md`).
- Exhausted retries fail the run per `../runs/lifecycle.md`: error text names the provider failure, usage from completed requests is kept (`../usage/tokens.md`).
- Compaction summaries and any other model call use the same retry policy; a compaction retry failure still never blocks a reply (`../context/persistent-context.md`).
- The policy is server-wide with no per-bot or per-provider overrides; it needs no setting and cannot be turned off.
