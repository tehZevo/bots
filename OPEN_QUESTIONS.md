# Open questions

Judgement calls baked into the current implementation that deserve a deliberate decision. Each lists the recommended lean; resolving one means updating the spec + code and removing the entry.

- **Manual "Run now" message text** — when no message is provided, `POST /api/bots/:id/run` injects "Continue with your current work."
  _Lean: keep generic phrasing; revisit when a chat UI exists so users can see/edit what gets injected._
- **Trigger→response mapping** — all triggers steered into one active loop are recorded in that single run; `output` is only the final assistant reply of the whole cycle, so individual trigger messages have no receipt.
  _Lean: keep runs as "working cycles" (matches spec) and defer per-trigger receipts until a channel needs them._
- **Steering mode** — live loops drain **all** queued messages at each drain point; one reply may answer several injections at once.
  _Lean: keep `all`; `one-at-a-time` triples LLM cost for no UX win so far._
- **Crash/restart recovery** — runs interrupted by a restart stay `running` forever, and in-flight context is only persisted when the loop goes quiet (crash loses that turn's messages).
  _Lean: on boot mark stale `running` rows `error("interrupted")` and persist incrementally via agent events._
- **Token estimation** — compaction budget uses chars/4 against 75% of `LLM_CONTEXT_WINDOW`.
  _Lean: keep until the context window is actually hit in practice, then tune ratio or adopt provider token counts._
- **Trigger enable/disable** — only whole bots can be disabled; individual triggers always fire while their bot is enabled.
  _Lean: add per-trigger flags when hook triggers (with secrets/pausing) land._
- **Clear memory vs active loop** — clearing memory aborts the running agent immediately and wipes context; the aborted run lands as `error`.
  _Lean: acceptable until approvals/chat exist, then confirm with the user before nuking a working loop._
- **Idle sandbox containers** — bot containers stay running until the bot is deleted; nothing reaps idle ones or caps total count.
  _Lean: reap after a day of inactivity and recreate lazily once bots multiply; revisit with auth/multi-user._
- **Sandbox provider abstraction** — the spec hardcodes Docker (`docker exec`, named containers) rather than an interchangeable runtime/provider interface from ROADMAP.
  _Lean: keep Docker-only until a remote or non-Docker host is actually needed, then extract the interface._
