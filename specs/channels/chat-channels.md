# Chat channels

- A channel binding connects an external chat platform to one bot; inbound messages become user turns through the same injection path as triggers (`runs/lifecycle.md`) with source `channel:<platform>`.
- Bindings store platform config and target bot; CRUD lives in the Settings tab. Secrets stay server-side and are shown masked after save (pattern of `llm/providers.md`).
- When a run triggered from a channel finishes, its final assistant text is delivered back to the originating conversation/thread when the platform supports replies.
- Incoming messages for a disabled bot are rejected with 409; delivery failures mark the outbound attempt in Logs without failing the run.
- The web `Chat` tab (`web-ui/chat-messages.md`) needs no binding — it is the built-in channel.
