# Open questions

Judgement calls baked into the current implementation that deserve a deliberate decision. Each lists the recommended lean; resolving one means updating the spec + code and removing the entry.

- **Trigger→response mapping** — all triggers steered into one active loop are recorded in that single run; `output` is only the final assistant reply of the whole cycle, so individual trigger messages have no receipt.
  _Lean: keep runs as "working cycles" (matches spec) and defer per-trigger receipts until a channel needs them._
- **Crash/restart recovery** — runs interrupted by a restart stay `running` forever, and in-flight context is only persisted when the loop goes quiet (crash loses that turn's messages).
  _Lean: on boot mark stale `running` rows `error("interrupted")` and persist incrementally via agent events._
- **Token estimation** — compaction budget uses chars/4 against 75% of `LLM_CONTEXT_WINDOW`.
  _Lean: keep until the context window is actually hit in practice, then tune ratio or adopt provider token counts._
- **Clear memory vs active loop** — clearing memory aborts the running agent immediately and wipes context; the aborted run lands as `error`.
  _Lean: acceptable until approvals exist, then confirm with the user before nuking a working loop._
- **Provider API key storage** — provider keys are planned for plaintext rows in SQLite (see `specs/llm/providers.md`).
  _Lean: keep plaintext behind a single-file volume; encrypt per-user once ownership exists._
- **Per-bot model overrides** — the API and run path accept a per-bot `model_id`, but no UI exposes the picker; the settings default covers every bot in practice.
  _Lean: surface the picker once per-user ownership defines who may pick which models._
- **Live team-prompt updates** — team membership/role info is injected into a bot's system prompt; unclear whether and how to update it mid-run when teams change (vs rebuild at next run start).
  _Lean: rebuild at next run start; revisit live update if staleness causes real issues._
- **MCP child execution boundary** — an MCP server runs as a host process with the orchestrator's filesystem and network access, unlike bot shell commands which are containerized (`specs/machines/sandbox.md`); the env allowlist (`specs/mcp/child-env.md`) narrows what a child inherits, not what it can reach.
  _Lean: keep MCP servers on the host for now; run them in a container once a real MCP server needs isolation._
- **MCP env values vs managed secrets** — MCP server env rows are a second plaintext store of secret values, separate from the Secrets registry (`specs/secrets/manage.md`); rows cannot currently reference a managed secret by name.
  _Lean: let MCP rows name a managed secret instead of holding a raw value; keep raw rows only as a fallback._

- **External agent state** — headless CLIs (opencode, Claude Code) keep their own session state in-container while pi history lives in SQLite; unclear whether memory survives container reaping.
  _Lean: store a per-bot CLI session id and use `--resume`/`-s`; fall back to injecting the SQLite transcript when resume is unavailable._
- **Injection into external agents** — `steer()` has no mid-run equivalent for headless CLIs, so scheduled/chat messages can't steer an in-flight CLI run.
  _Lean: queue injected messages and start them as the next run when the current one exits; never kill+restart to inject._
