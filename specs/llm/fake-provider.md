# Fake LLM provider (dev mode)

- With server env `DEV_FAKE_LLM=1` at boot, Settings → Providers shows a built-in read-only `Fake` provider whose models run scripted replies through the exact real stream path — same events, usage accounting, persistence and transitions as any provider; without the flag it does not exist anywhere (`../llm/providers.md`).
- A message may carry a directive block — `[[fake]] {json} [[/fake]]` — interpreted by fake models only (stripped from context before storage): `{ "reply", "delay_ms", "thinking": bool, "tool_calls": [{ "name", "output", "delay_ms" }], "fail_http": 429|500, "fail_times": N, "hang": true, "tokens_in", "tokens_out" }`.
- Semantics: `reply` streams word-by-word at ~30 ms intervals after `delay_ms`; each tool call emits a real tool_use turn (executed against the actual tool, output overridden) then continues; `fail_http` fails the first `fail_times` requests so retry/backoff and the circuit breaker exercise for real (`../llm/retry-backoff.md`, `../usage/circuit-breaker.md`); `hang` never resolves until interrupted.
- Without a directive block a fake model echoes `FAKE OK (<bot name>)` after 1 s — enough to smoke test run lifecycle end to end with no keys or network.
- Fake usage numbers are reported as given (or 50 tokens in / out by default) and take part in budgets, breaker totals and Stats like real ones; a hang interrupted behaves per `../bots/interrupt.md`.
- The directive never reaches the dashboard prompt view unstripped, and fake models appear in model pickers only while the flag is on.
