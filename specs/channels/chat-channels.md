# Chat channels

- A channel binding connects one external chat platform (Slack, Discord, Telegram) to one bot; inbound messages become user turns through the same steering path chat and triggers use (`../runs/lifecycle.md`), recorded with source `channel:<platform>` in audit (`../audit/log.md`).
- Bindings are managed on the **Integrations** tab beside MCP servers: platform, credentials, target bot; secrets stay server-side, masked after save like provider keys (`../llm/providers.md`).
- When a run started from a channel finishes, its final assistant reply is delivered back to the originating conversation/thread where the platform supports it; delivery failures are logged against the run without failing it.
- Inbound messages for a disabled bot answer 409 and are never queued; global pause holds them like chat sends (`../bots/global-pause.md`).
- The built-in web chat needs no binding — it is the reference channel (`../chat/messages.md`); channels add platform adapters, not new turn semantics.
